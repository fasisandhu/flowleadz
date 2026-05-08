import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject as createProjectFixture, createUser } from "@/tests/fixtures/factories";
import { updateProject } from "@/lib/services/projects";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("projects.updateProject", () => {
  it("admin can update name + description + status", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, org.id, admin.id, { status: "draft" });
      const r = await updateProject(db, ctxOf(org.id, "admin", admin.id), {
        id: project.id,
        name: "Updated",
        description: "New description",
        status: "active",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.name).toBe("Updated");
      expect(r.data.description).toBe("New description");
      expect(r.data.status).toBe("active");
    });
  });

  it("not_found if project belongs to another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, orgB.id, admin.id);
      const r = await updateProject(db, ctxOf(orgA.id, "admin", admin.id), {
        id: project.id,
        name: "Updated",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });

  it("employee cannot update a project (unauthorized)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProjectFixture(db, org.id, admin.id);
      const r = await updateProject(db, ctxOf(org.id, "employee", employee.id), {
        id: project.id,
        name: "Updated",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("status transition to 'archived' sets archivedAt", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProjectFixture(db, org.id, admin.id, { status: "active" });
      const r = await updateProject(db, ctxOf(org.id, "admin", admin.id), {
        id: project.id,
        status: "archived",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("archived");
      expect(r.data.archivedAt).not.toBeNull();
    });
  });
});

afterAll(async () => {
  await closePool();
});
