import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { softDeleteComment } from "@/lib/services/comments";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("comments.softDeleteComment", () => {
  it("author can soft-delete; deletedAt is set; row remains", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      const [comment] = await db
        .insert(schema.comments)
        .values({ parentType: "daily_update", parentId: update!.id, userId: author.id, body: "x" })
        .returning();

      const r = await softDeleteComment(db, ctxOf(org.id, "employee", author.id), { id: comment!.id });
      expect(r.ok).toBe(true);

      const [row] = await db.select().from(schema.comments).where(eq(schema.comments.id, comment!.id));
      expect(row).toBeDefined();
      expect(row!.deletedAt).not.toBeNull();
    });
  });

  it("admin can soft-delete any comment", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id, projectId: project.id, userId: admin.id,
          body: "u", activityType: "execution", visibility: "customer_visible", logDate: "2026-05-08",
        })
        .returning();
      const [comment] = await db
        .insert(schema.comments)
        .values({ parentType: "daily_update", parentId: update!.id, userId: author.id, body: "x" })
        .returning();
      const r = await softDeleteComment(db, ctxOf(org.id, "admin", admin.id), { id: comment!.id });
      expect(r.ok).toBe(true);
    });
  });

  it("non-author non-admin cannot delete", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id, projectId: project.id, userId: admin.id,
          body: "u", activityType: "execution", visibility: "customer_visible", logDate: "2026-05-08",
        })
        .returning();
      const [comment] = await db
        .insert(schema.comments)
        .values({ parentType: "daily_update", parentId: update!.id, userId: author.id, body: "x" })
        .returning();
      const r = await softDeleteComment(db, ctxOf(org.id, "employee", other.id), { id: comment!.id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });
});

afterAll(async () => {
  await closePool();
});
