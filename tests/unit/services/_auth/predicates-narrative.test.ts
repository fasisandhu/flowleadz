import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  assignProject,
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import {
  requireDailyUpdateRead,
  requireCommentWrite,
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

async function createUpdate(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  userId: string,
  visibility: "customer_visible" | "internal_only" = "customer_visible",
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId,
      projectId,
      userId,
      body: "Test update",
      activityType: "execution",
      visibility,
      logDate: "2026-05-08",
    })
    .returning();
  return row!;
}

describe("requireDailyUpdateRead", () => {
  it("ok for admin always", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id);
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "admin", admin.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for assigned employee on a customer_visible update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const update = await createUpdate(db, org.id, project.id, admin.id);
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "employee", employee.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("ok for assigned employee on an internal_only update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, project.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "employee", employee.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized for customer on an internal_only update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("ok for customer on a customer_visible update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "customer_visible");
      const r = await requireDailyUpdateRead(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("not_found if update is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const update = await createUpdate(db, orgB.id, project.id, admin.id);
      const r = await requireDailyUpdateRead(db, orgCtx(orgA.id, "admin", admin.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

describe("requireCommentWrite", () => {
  it("ok if actor can read the parent update (customer on customer_visible)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "customer_visible");
      const r = await requireCommentWrite(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("unauthorized if actor cannot read parent (customer on internal_only)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await createUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await requireCommentWrite(db, orgCtx(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
