import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { createComment } from "@/lib/services/comments";
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
  visibility: "customer_visible" | "internal_only" = "customer_visible",
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId,
      projectId,
      userId,
      body: "u",
      activityType: "execution",
      visibility,
      logDate: "2026-05-08",
    })
    .returning();
  return row!;
}

describe("comments.createComment", () => {
  it("customer can comment on customer_visible update; notifies the author", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);

      const r = await createComment(db, ctxOf(org.id, "customer", customer.id), {
        dailyUpdateId: update.id,
        body: "Looks great!",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Looks great!");
      expect(r.data.userId).toBe(customer.id);

      const notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, admin.id));
      expect(notifs).toHaveLength(1);
      expect(notifs[0]!.eventType).toBe("comment.posted");
    });
  });

  it("customer cannot comment on internal_only update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id, "internal_only");
      const r = await createComment(db, ctxOf(org.id, "customer", customer.id), {
        dailyUpdateId: update.id,
        body: "x",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("notifies prior commenters in addition to the author (deduped, excluding actor)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const c1 = await createUser(db, { role: "customer" });
      const c2 = await createUser(db, { role: "customer" });
      await createMembership(db, c1.id, org.id);
      await createMembership(db, c2.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);

      await createComment(db, ctxOf(org.id, "customer", c1.id), {
        dailyUpdateId: update.id,
        body: "first",
      });
      const r = await createComment(db, ctxOf(org.id, "customer", c2.id), {
        dailyUpdateId: update.id,
        body: "second",
      });
      expect(r.ok).toBe(true);

      const adminNotifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, admin.id));
      const c1Notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, c1.id));
      const c2Notifs = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, c2.id));
      // admin: notified by c1's comment AND c2's comment = 2
      expect(adminNotifs.filter((n) => n.eventType === "comment.posted")).toHaveLength(2);
      // c1: notified by c2's comment = 1
      expect(c1Notifs.filter((n) => n.eventType === "comment.posted")).toHaveLength(1);
      // c2 (actor): not notified
      expect(c2Notifs).toHaveLength(0);
    });
  });

  it("rejects empty body", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const r = await createComment(db, ctxOf(org.id, "admin", admin.id), {
        dailyUpdateId: update.id,
        body: "",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });
});

afterAll(async () => {
  await closePool();
});
