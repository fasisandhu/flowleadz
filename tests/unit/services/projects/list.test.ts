import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { assignProject, createMembership, createOrg, createProject as createProjectFixture, createUser } from "@/tests/fixtures/factories";
import { listProjects, getProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.listProjects", () => {
  it("admin sees all projects in their ctx.orgId", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      await createProjectFixture(db, org.id, admin.id, { name: "P1" });
      await createProjectFixture(db, org.id, admin.id, { name: "P2" });
      const r = await listProjects(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name).sort()).toEqual(["P1", "P2"]);
    });
  });

  it("employee only sees projects they're assigned to", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProjectFixture(db, org.id, admin.id, { name: "P1" });
      await createProjectFixture(db, org.id, admin.id, { name: "P2" });
      await assignProject(db, employee.id, p1.id);
      const r = await listProjects(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name)).toEqual(["P1"]);
    });
  });

  it("customer sees all non-draft projects in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      await createProjectFixture(db, org.id, admin.id, { name: "Active", status: "active" });
      await createProjectFixture(db, org.id, admin.id, { name: "Draft", status: "draft" });
      const r = await listProjects(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name)).toEqual(["Active"]);
    });
  });

  it("status filter narrows the result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      await createProjectFixture(db, org.id, admin.id, { name: "Active", status: "active" });
      await createProjectFixture(db, org.id, admin.id, { name: "Archived", status: "archived" });
      const r = await listProjects(db, ctxOf(org.id, "admin", admin.id), { status: "active" });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((p) => p.name)).toEqual(["Active"]);
    });
  });
});

describe("projects.getProject", () => {
  it("returns the project for an admin", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await getProject(db, ctxOf(org.id, "admin", admin.id), project.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.id).toBe(project.id);
    });
  });

  it("not_found if customer requests a draft project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProjectFixture(db, org.id, admin.id, { status: "draft" });
      const r = await getProject(db, ctxOf(org.id, "customer", customer.id), project.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
