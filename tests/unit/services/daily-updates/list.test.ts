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
import { listDailyUpdates, getDailyUpdate } from "@/lib/services/daily-updates";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedUpdate(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  userId: string,
  overrides: Partial<typeof schema.dailyUpdates.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId,
      projectId,
      userId,
      body: "u",
      activityType: "execution",
      visibility: "customer_visible",
      logDate: "2026-05-08",
      ...overrides,
    })
    .returning();
  return row!;
}

describe("daily-updates.listDailyUpdates", () => {
  it("admin sees all updates in their org", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, project.id, admin.id, { body: "A", visibility: "customer_visible" });
      await seedUpdate(db, org.id, project.id, admin.id, { body: "B", visibility: "internal_only" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(2);
    });
  });

  it("customer only sees customer_visible updates", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Public", visibility: "customer_visible" });
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Private", visibility: "internal_only" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "customer", customer.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["Public"]);
    });
  });

  it("employee only sees updates on assigned projects", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const employee = await createUser(db, { role: "employee" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await assignProject(db, employee.id, p1.id);
      await seedUpdate(db, org.id, p1.id, admin.id, { body: "On P1" });
      await seedUpdate(db, org.id, p2.id, admin.id, { body: "On P2" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "employee", employee.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["On P1"]);
    });
  });

  it("projectId filter narrows the result", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const p1 = await createProject(db, org.id, admin.id);
      const p2 = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, p1.id, admin.id, { body: "P1" });
      await seedUpdate(db, org.id, p2.id, admin.id, { body: "P2" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "admin", admin.id), { projectId: p1.id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["P1"]);
    });
  });

  it("orders by logDate desc then createdAt desc", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Older", logDate: "2026-04-01" });
      await seedUpdate(db, org.id, project.id, admin.id, { body: "Newer", logDate: "2026-05-08" });
      const r = await listDailyUpdates(db, ctxOf(org.id, "admin", admin.id), {});
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((u) => u.body)).toEqual(["Newer", "Older"]);
    });
  });
});

describe("daily-updates.getDailyUpdate", () => {
  it("admin fetches", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const r = await getDailyUpdate(db, ctxOf(org.id, "admin", admin.id), update.id);
      expect(r.ok).toBe(true);
    });
  });

  it("customer cannot fetch internal_only", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id, { visibility: "internal_only" });
      const r = await getDailyUpdate(db, ctxOf(org.id, "customer", customer.id), update.id);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
