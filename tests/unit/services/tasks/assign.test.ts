import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { assignTask, unassignTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.assignTask", () => {
  it("admin can assign an employee", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await assignTask(db, ctxOf(org.id, "admin", admin.id), {
        taskId: task.id,
        userId: employee.id,
      });
      expect(r.ok).toBe(true);
      const found = await db
        .select()
        .from(schema.taskAssignments)
        .where(
          and(
            eq(schema.taskAssignments.taskId, task.id),
            eq(schema.taskAssignments.userId, employee.id),
          ),
        );
      expect(found).toHaveLength(1);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, employee.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("task.assigned");
    });
  });

  it("idempotent on duplicate assign — notification fires only once", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await assignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: employee.id });
      await assignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: employee.id });
      const found = await db.select().from(schema.taskAssignments);
      expect(found).toHaveLength(1);
      const notifs = await db.select().from(schema.notifications);
      expect(notifs).toHaveLength(1);
    });
  });

  it("rejects assigning a customer", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await assignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: customer.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

describe("tasks.unassignTask", () => {
  it("removes the assignment without firing a notification", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await db.insert(schema.taskAssignments).values({ taskId: task.id, userId: employee.id });

      const r = await unassignTask(db, ctxOf(org.id, "admin", admin.id), { taskId: task.id, userId: employee.id });
      expect(r.ok).toBe(true);
      const found = await db.select().from(schema.taskAssignments);
      expect(found).toHaveLength(0);
      const notifs = await db.select().from(schema.notifications);
      expect(notifs).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
