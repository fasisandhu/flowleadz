import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.createTask", () => {
  it("admin can create a task tied to a project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        title: "Initial keyword research",
        priority: "high",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.title).toBe("Initial keyword research");
      expect(r.data.priority).toBe("high");
      expect(r.data.status).toBe("todo");
      expect(r.data.source).toBe("admin_created");
      expect(r.data.projectId).toBe(project.id);
      expect(r.data.customerVisible).toBe(true);
    });
  });

  it("inserts a task_status_log row for the create event", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        title: "T1",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const logs = await db
        .select()
        .from(schema.taskStatusLog)
        .where(eq(schema.taskStatusLog.taskId, r.data.id));
      expect(logs).toHaveLength(1);
      expect(logs[0]!.fromStatus).toBeNull();
      expect(logs[0]!.toStatus).toBe("todo");
    });
  });

  it("customer cannot create tasks", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "customer", customer.id), {
        projectId: project.id,
        title: "T1",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found when project is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const r = await createTask(db, ctxOf(orgA.id, "admin", admin.id), {
        projectId: project.id,
        title: "T1",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });

  it("rejects empty title", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await createTask(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        title: "",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
