import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createOrg, createProject, createUser, createTask } from "@/tests/fixtures/factories";
import { updateTask } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.updateTask", () => {
  it("admin can update title + description + priority + dueDate", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await updateTask(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        title: "Updated",
        description: "Now with details",
        priority: "urgent",
        dueDate: "2026-09-30",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.title).toBe("Updated");
      expect(r.data.priority).toBe("urgent");
      expect(r.data.dueDate).toBe("2026-09-30");
    });
  });

  it("assigned employee can update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await updateTask(db, ctxOf(org.id, "employee", employee.id), {
        id: task.id,
        title: "Employee update",
      });
      expect(r.ok).toBe(true);
    });
  });

  it("customer cannot update tasks", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await updateTask(db, ctxOf(org.id, "customer", customer.id), {
        id: task.id,
        title: "Try",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("does NOT change status (status is in a separate op, schema is strict)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await updateTask(db, ctxOf(org.id, "admin", admin.id), {
        id: task.id,
        // @ts-expect-error — verifying schema rejects unknown field
        status: "done",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
