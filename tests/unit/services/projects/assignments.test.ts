import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject as createProjectFixture, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { assignToProject, unassignFromProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.assignToProject", () => {
  it("admin can assign an employee to a project", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await assignToProject(db, ctxOf(org.id, "admin", admin.id), {
        projectId: project.id,
        userId: employee.id,
      });
      expect(r.ok).toBe(true);
      const found = await db
        .select()
        .from(schema.projectAssignments)
        .where(
          and(
            eq(schema.projectAssignments.projectId, project.id),
            eq(schema.projectAssignments.userId, employee.id),
          ),
        );
      expect(found).toHaveLength(1);
    });
  });

  it("idempotent on duplicate assign", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r1 = await assignToProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      const r2 = await assignToProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r1.ok && r2.ok).toBe(true);
      const found = await db.select().from(schema.projectAssignments);
      expect(found).toHaveLength(1);
    });
  });

  it("rejects assigning a customer (only staff can be assigned)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await assignToProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: customer.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("non-admin cannot assign", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await assignToProject(db, ctxOf(org.id, "employee", employee.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found when project is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, orgB.id, admin.id);
      const r = await assignToProject(db, ctxOf(orgA.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

describe("projects.unassignFromProject", () => {
  it("admin can unassign", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      await db.insert(schema.projectAssignments).values({ userId: employee.id, projectId: project.id });
      const r = await unassignFromProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(true);
      const found = await db.select().from(schema.projectAssignments);
      expect(found).toHaveLength(0);
    });
  });

  it("idempotent when no assignment exists", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await unassignFromProject(db, ctxOf(org.id, "admin", admin.id), { projectId: project.id, userId: employee.id });
      expect(r.ok).toBe(true);
    });
  });
});

afterAll(async () => {
  await closePool();
});
