import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createTask,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createDailyUpdate } from "@/lib/services/daily-updates";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("daily-updates.createDailyUpdate", () => {
  it("admin can post an update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "Today we shipped...",
        activityType: "execution",
        visibility: "customer_visible",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Today we shipped...");
      expect(r.data.visibility).toBe("customer_visible");
      expect(r.data.activityType).toBe("execution");
      expect(r.data.userId).toBe(admin.id);
    });
  });

  it("links referenced tasks via daily_update_tasks", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const t1 = await createTask(db, org.id, project.id, admin.id, { title: "T1" });
      const t2 = await createTask(db, org.id, project.id, admin.id, { title: "T2" });
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "worked on both",
        activityType: "execution",
        logDate: "2026-05-08",
        taskIds: [t1.id, t2.id],
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const links = await db
        .select()
        .from(schema.dailyUpdateTasks)
        .where(eq(schema.dailyUpdateTasks.dailyUpdateId, r.data.id));
      expect(links.map((l) => l.taskId).sort()).toEqual([t1.id, t2.id].sort());
    });
  });

  it("rejects taskIds that don't belong to projectId", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      const otherTask = await createTask(db, org.id, p2.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: p1.id,
        body: "x",
        activityType: "execution",
        logDate: "2026-05-08",
        taskIds: [otherTask.id],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("notifies customer users when visibility=customer_visible", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        visibility: "customer_visible",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("daily_update.posted");
    });
  });

  it("does NOT notify customers when visibility=internal_only", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        visibility: "internal_only",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(true);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, customer.id));
      expect(notifs).toHaveLength(0);
    });
  });

  it("notifies task assignees of referenced tasks (deduped, excluding actor)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await db.insert(schema.taskAssignments).values({ taskId: task.id, userId: employee.id });

      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        visibility: "internal_only",
        logDate: "2026-05-08",
        taskIds: [task.id],
      });
      expect(r.ok).toBe(true);
      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, employee.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("daily_update.posted");
    });
  });

  it("customer cannot post updates", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createDailyUpdate(db, ctxOf(org.id, "customer", customer.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        logDate: "2026-05-08",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("rejects logDate in the future", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const futureYear = new Date().getFullYear() + 10;
      const r = await createDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        body: "x",
        activityType: "execution",
        logDate: `${futureYear}-01-01`,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
