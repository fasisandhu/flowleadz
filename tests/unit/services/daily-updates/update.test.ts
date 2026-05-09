import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateDailyUpdate } from "@/lib/services/daily-updates";
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
      body: "Original body",
      activityType: "execution",
      visibility: "customer_visible",
      logDate: "2026-05-08",
      ...overrides,
    })
    .returning();
  return row!;
}

describe("daily-updates.updateDailyUpdate", () => {
  it("author can update body + activityType + visibility, capturing the prior state", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);

      const r = await updateDailyUpdate(db, ctxOf(org.id, "employee", author.id), {
        id: update.id,
        body: "Edited body",
        activityType: "review",
        visibility: "internal_only",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Edited body");
      expect(r.data.activityType).toBe("review");
      expect(r.data.visibility).toBe("internal_only");

      const revs = await db
        .select()
        .from(schema.dailyUpdateRevisions)
        .where(eq(schema.dailyUpdateRevisions.dailyUpdateId, update.id));
      expect(revs).toHaveLength(1);
      expect(revs[0]!.body).toBe("Original body");
      expect(revs[0]!.activityType).toBe("execution");
      expect(revs[0]!.visibility).toBe("customer_visible");
      expect(revs[0]!.editedBy).toBe(author.id);
    });
  });

  it("admin can update someone else's update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);
      const r = await updateDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        id: update.id,
        body: "Admin edit",
      });
      expect(r.ok).toBe(true);
    });
  });

  it("non-author non-admin employee cannot update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);
      const r = await updateDailyUpdate(db, ctxOf(org.id, "employee", other.id), {
        id: update.id,
        body: "Steal",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("noop returns ok with no revision row when nothing changed", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, author.id);
      const r = await updateDailyUpdate(db, ctxOf(org.id, "admin", admin.id), {
        id: update.id,
        body: "Original body",
      });
      expect(r.ok).toBe(true);
      const revs = await db
        .select()
        .from(schema.dailyUpdateRevisions)
        .where(eq(schema.dailyUpdateRevisions.dailyUpdateId, update.id));
      expect(revs).toHaveLength(0);
    });
  });

  it("not_found if update is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const update = await seedUpdate(db, orgB.id, project.id, admin.id);
      const r = await updateDailyUpdate(db, ctxOf(orgA.id, "admin", admin.id), {
        id: update.id,
        body: "x",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
