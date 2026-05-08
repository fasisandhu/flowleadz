import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import {
  requireOrgAccess,
  requireProjectAccess,
  requireRole,
} from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";

const orgCtx = (
  orgId: string,
  role: "customer" | "employee" | "admin",
  userId: string,
  membershipOrgId: string | null = null,
): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? (membershipOrgId ?? orgId) : null },
});

describe("requireOrgAccess", () => {
  it("ok for customer who is a member of the org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "customer" });
      await createMembership(db, user.id, org.id);
      const r = await requireOrgAccess(db, orgCtx(org.id, "customer", user.id, org.id));
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for customer who has no membership in the requested org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "customer" });
      const r = await requireOrgAccess(db, orgCtx(org.id, "customer", user.id, org.id));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("ok for staff regardless of membership", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const user = await createUser(db, { role: "employee" });
      const r = await requireOrgAccess(db, orgCtx(org.id, "employee", user.id));
      expect(r.ok).toBe(true);
    });
  });
});

describe("requireProjectAccess", () => {
  it("ok for admin always", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const r = await requireProjectAccess(db, orgCtx(org.id, "admin", admin.id), project.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for employee with project_assignment", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const r = await requireProjectAccess(db, orgCtx(org.id, "employee", employee.id), project.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for employee without project_assignment", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const r = await requireProjectAccess(db, orgCtx(org.id, "employee", employee.id), project.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("ok for customer if project belongs to their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const r = await requireProjectAccess(db, orgCtx(org.id, "customer", customer.id, org.id), project.id);
      expect(r.ok).toBe(true);
    });
  });

  it("not_found if project_id refers to a row in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const otherProject = await createProject(db, orgB.id, admin.id);
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, orgA.id);
      const r = await requireProjectAccess(db, orgCtx(orgA.id, "customer", customer.id, orgA.id), otherProject.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

describe("requireRole", () => {
  it("ok when actor.role matches", () => {
    const ctx = orgCtx("org_x", "admin", "u_x");
    const r = requireRole(ctx, "admin");
    expect(r.ok).toBe(true);
  });

  it("unauthorized when actor.role doesn't match", () => {
    const ctx = orgCtx("org_x", "employee", "u_x");
    const r = requireRole(ctx, "admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("unauthorized");
  });
});

afterAll(async () => {
  await closePool();
});
