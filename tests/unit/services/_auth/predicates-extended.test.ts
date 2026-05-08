import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createTask,
  createUser,
} from "@/tests/fixtures/factories";
import {
  requireTaskRead,
  requireTaskWrite,
} from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";

const orgCtx = (
  orgId: string,
  role: "customer" | "employee" | "admin",
  userId: string,
): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("requireTaskRead", () => {
  it("ok for admin", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(org.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for assigned employee", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(org.id, "employee", employee.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for unassigned employee", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(org.id, "employee", employee.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("ok for customer when task is customer_visible", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, { customerVisible: true });
      const r = await requireTaskRead(db, orgCtx(org.id, "customer", customer.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for customer when task is internal-only", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id, { customerVisible: false });
      const r = await requireTaskRead(db, orgCtx(org.id, "customer", customer.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found if task is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const task = await createTask(db, orgB.id, project.id, admin.id);
      const r = await requireTaskRead(db, orgCtx(orgA.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

describe("requireTaskWrite", () => {
  it("ok for admin", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskWrite(db, orgCtx(org.id, "admin", admin.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for employee assigned to project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskWrite(db, orgCtx(org.id, "employee", employee.id), task.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for customer always", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await requireTaskWrite(db, orgCtx(org.id, "customer", customer.id), task.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
