import { describe, expect, test } from "vitest";
import * as schema from "@/lib/db/schema";
import { withTransaction } from "@/tests/fixtures/db";
import {
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import { listActivityForTask, listRecentActivity } from "@/lib/services/tasks/activity";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.listActivityForTask", () => {
  test("returns interleaved events sorted ascending", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const employee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);

      await tx.insert(schema.projectAssignments).values({
        userId: employee.id,
        projectId: project.id,
      });

      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "A task",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();

      const [update] = await tx
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: employee.id,
          body: "Working on it.",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-10",
        })
        .returning();
      await tx
        .insert(schema.dailyUpdateTasks)
        .values({ dailyUpdateId: update!.id, taskId: task!.id });

      await tx.insert(schema.taskStatusLog).values({
        taskId: task!.id,
        changedBy: admin.id,
        fromStatus: "todo",
        toStatus: "in_progress",
      });

      await tx.insert(schema.timeEntries).values({
        orgId: org.id,
        projectId: project.id,
        taskId: task!.id,
        userId: employee.id,
        minutes: 60,
        loggedForDate: "2026-05-10",
        note: "An hour of work",
      });

      const r = await listActivityForTask(tx, ctxOf(org.id, "employee", employee.id), task!.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.length).toBe(3);
      const timestamps = r.data.map((e) => new Date(e.createdAt).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]!);
      }
      const kinds = r.data.map((e) => e.kind);
      expect(kinds).toContain("update");
      expect(kinds).toContain("status_change");
      expect(kinds).toContain("time_log");
    });
  });

  test("hides internal_only updates from customer", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const customer = await createUser(tx, { role: "customer" });
      await createMembership(tx, customer.id, org.id);
      const project = await createProject(tx, org.id, admin.id);
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Visible task",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();

      const [internalUpdate] = await tx
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "Internal note",
          activityType: "execution",
          visibility: "internal_only",
          logDate: "2026-05-10",
        })
        .returning();
      await tx
        .insert(schema.dailyUpdateTasks)
        .values({ dailyUpdateId: internalUpdate!.id, taskId: task!.id });

      const r = await listActivityForTask(tx, ctxOf(org.id, "customer", customer.id), task!.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const updates = r.data.filter((e) => e.kind === "update");
      expect(updates.length).toBe(0);
    });
  });

  test("returns unauthorized when actor cannot read the task", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const otherEmployee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Secret task",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      const r = await listActivityForTask(
        tx,
        ctxOf(org.id, "employee", otherEmployee.id),
        task!.id,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(["unauthorized", "not_found"]).toContain(r.error.code);
    });
  });
});

describe("tasks.listRecentActivity", () => {
  test("returns most recent events across visible tasks", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const employee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.projectAssignments).values({
        userId: employee.id,
        projectId: project.id,
      });
      const [taskA] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Task A",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      const [taskB] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Task B",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      await tx.insert(schema.taskStatusLog).values([
        { taskId: taskA!.id, changedBy: admin.id, fromStatus: "todo", toStatus: "in_progress" },
        { taskId: taskB!.id, changedBy: admin.id, fromStatus: "todo", toStatus: "blocked" },
      ]);

      const r = await listRecentActivity(tx, ctxOf(org.id, "employee", employee.id), 10);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.length).toBe(2);
      const taskIds = r.data.map((e) => e.taskId);
      expect(taskIds).toContain(taskA!.id);
      expect(taskIds).toContain(taskB!.id);
    });
  });

  test("employee with no assignments sees no activity", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const lonelyEmployee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "T",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      await tx.insert(schema.taskStatusLog).values({
        taskId: task!.id,
        changedBy: admin.id,
        fromStatus: "todo",
        toStatus: "done",
      });
      const r = await listRecentActivity(
        tx,
        ctxOf(org.id, "employee", lonelyEmployee.id),
        10,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.length).toBe(0);
    });
  });
});
