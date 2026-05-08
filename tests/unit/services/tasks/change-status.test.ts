import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { changeTaskStatus } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.changeTaskStatus", () => {
  it("transitions todo -> in_progress and inserts status_log", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "in_progress",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("in_progress");
      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, task.id));
      expect(logs.filter((l) => l.toStatus === "in_progress")).toHaveLength(1);
    });
  });

  it("transition to 'done' sets completedAt", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, { status: "in_progress" });
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "done",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("done");
      expect(r.data.completedAt).not.toBeNull();
    });
  });

  it("re-opening from 'done' clears completedAt", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, { status: "done" });
      await db.update(schema.tasks).set({ completedAt: new Date() }).where(eq(schema.tasks.id, task.id));
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "in_progress",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.completedAt).toBeNull();
    });
  });

  it("rejects illegal transitions (done -> blocked is NOT allowed)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, { status: "done" });
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "blocked",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("noop when toStatus equals current status (idempotent ok, no log row)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, { status: "in_progress" });
      const r = await changeTaskStatus(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        toStatus: "in_progress",
      });
      expect(r.ok).toBe(true);
      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, task.id));
      expect(logs).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
