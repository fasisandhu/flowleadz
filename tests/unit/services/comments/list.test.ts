import { afterAll, describe, expect, it } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { listComments } from "@/lib/services/comments";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("comments.listComments", () => {
  it("returns comments in chronological order including soft-deleted", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id, projectId: project.id, userId: admin.id,
          body: "u", activityType: "execution", visibility: "customer_visible", logDate: "2026-05-08",
        })
        .returning();
      // Insert with explicit timestamps to control ordering deterministically
      const t0 = new Date(Date.UTC(2026, 4, 8, 12, 0, 0));
      const t1 = new Date(Date.UTC(2026, 4, 8, 12, 0, 1));
      const t2 = new Date(Date.UTC(2026, 4, 8, 12, 0, 2));
      await db.insert(schema.comments).values({
        parentType: "daily_update", parentId: update!.id, userId: admin.id, body: "First", createdAt: t0,
      });
      await db.insert(schema.comments).values({
        parentType: "daily_update", parentId: update!.id, userId: admin.id, body: "Second", deletedAt: new Date(), createdAt: t1,
      });
      await db.insert(schema.comments).values({
        parentType: "daily_update", parentId: update!.id, userId: admin.id, body: "Third", createdAt: t2,
      });

      const r = await listComments(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "daily_update",
        parentId: update!.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((c) => c.body)).toEqual(["First", "Second", "Third"]);
      expect(r.data[1]!.deletedAt).not.toBeNull();
    });
  });

  it("respects parent update read auth (customer cannot list internal_only comments)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id, projectId: project.id, userId: admin.id,
          body: "u", activityType: "execution", visibility: "internal_only", logDate: "2026-05-08",
        })
        .returning();
      const r = await listComments(db, ctxOf(org.id, "customer", customer.id), {
        parentType: "daily_update",
        parentId: update!.id,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
