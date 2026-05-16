import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import { updateComment } from "@/lib/services/comments";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedComment(
  db: Parameters<typeof createUser>[0],
  dailyUpdateId: string,
  userId: string,
  body: string = "Original",
) {
  const [row] = await db
    .insert(schema.comments)
    .values({ parentType: "daily_update", parentId: dailyUpdateId, userId, body })
    .returning();
  return row!;
}

async function seedUpdate(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  projectId: string,
  userId: string,
) {
  const [row] = await db
    .insert(schema.dailyUpdates)
    .values({
      orgId, projectId, userId,
      body: "u", activityType: "execution", visibility: "customer_visible",
      logDate: "2026-05-08",
    })
    .returning();
  return row!;
}

describe("comments.updateComment", () => {
  it("author can update body; revision captures prior body", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const comment = await seedComment(db, update.id, author.id, "Original");

      const r = await updateComment(db, ctxOf(org.id, "employee", author.id), {
        id: comment.id,
        body: "Edited",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.body).toBe("Edited");
      const revs = await db
        .select()
        .from(schema.commentRevisions)
        .where(eq(schema.commentRevisions.commentId, comment.id));
      expect(revs).toHaveLength(1);
      expect(revs[0]!.body).toBe("Original");
      expect(revs[0]!.editedBy).toBe(author.id);
    });
  });

  it("non-author non-admin cannot update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const other = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const comment = await seedComment(db, update.id, author.id);
      const r = await updateComment(db, ctxOf(org.id, "employee", other.id), {
        id: comment.id,
        body: "Steal",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("admin can update any comment", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const author = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const comment = await seedComment(db, update.id, author.id);
      const r = await updateComment(db, ctxOf(org.id, "admin", admin.id), {
        id: comment.id,
        body: "Admin edit",
      });
      expect(r.ok).toBe(true);
    });
  });

  it("noop returns ok with no revision row", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const update = await seedUpdate(db, org.id, project.id, admin.id);
      const comment = await seedComment(db, update.id, admin.id, "Same");
      const r = await updateComment(db, ctxOf(org.id, "admin", admin.id), {
        id: comment.id,
        body: "Same",
      });
      expect(r.ok).toBe(true);
      const revs = await db
        .select()
        .from(schema.commentRevisions)
        .where(eq(schema.commentRevisions.commentId, comment.id));
      expect(revs).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
