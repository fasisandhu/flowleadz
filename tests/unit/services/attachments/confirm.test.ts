import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import type { OrgContext } from "@/lib/services/_context";

vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(async () => "https://r2.example.com/u"),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(),
}));

import { headObject } from "@/lib/storage/r2-client";
import { confirm, getUploadUrl } from "@/lib/services/attachments";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

beforeEach(() => {
  vi.mocked(headObject).mockReset();
});

async function seedPendingAttachment(
  db: Parameters<typeof createUser>[0],
  ctx: OrgContext,
  parentId: string,
): Promise<string> {
  const r = await getUploadUrl(db, ctx, {
    parentType: "task",
    parentId,
    filename: "x.pdf",
    contentType: "application/pdf",
    sizeBytes: 100,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.data.attachmentId;
}

describe("attachments.confirm", () => {
  it("flips pending -> ready when HEAD returns matching size", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(org.id, "admin", admin.id), task.id);

      vi.mocked(headObject).mockResolvedValueOnce({ ContentLength: 100 } as never);

      const r = await confirm(db, ctxOf(org.id, "admin", admin.id), { id });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.status).toBe("ready");
      expect(r.data.confirmedAt).not.toBeNull();
    });
  });

  it("flips to failed when HEAD throws (object missing)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(org.id, "admin", admin.id), task.id);

      vi.mocked(headObject).mockRejectedValueOnce(new Error("NotFound"));

      const r = await confirm(db, ctxOf(org.id, "admin", admin.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");

      const [row] = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.id, id));
      expect(row!.status).toBe("failed");
    });
  });

  it("flips to failed on size mismatch", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(org.id, "admin", admin.id), task.id);

      vi.mocked(headObject).mockResolvedValueOnce({ ContentLength: 999 } as never);

      const r = await confirm(db, ctxOf(org.id, "admin", admin.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");

      const [row] = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.id, id));
      expect(row!.status).toBe("failed");
    });
  });

  it("only the uploader or admin can confirm; cross-user employee blocked", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const e1 = await createUser(db, { role: "employee" });
      const e2 = await createUser(db, { role: "employee" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await db.insert(schema.projectAssignments).values({ userId: e1.id, projectId: project.id });
      await db.insert(schema.projectAssignments).values({ userId: e2.id, projectId: project.id });
      const id = await seedPendingAttachment(db, ctxOf(org.id, "employee", e1.id), task.id);

      const r = await confirm(db, ctxOf(org.id, "employee", e2.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("unauthorized");
    });
  });

  it("not_found if attachment is in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const task = await createTask(db, orgB.id, project.id, admin.id);
      const id = await seedPendingAttachment(db, ctxOf(orgB.id, "admin", admin.id), task.id);

      const r = await confirm(db, ctxOf(orgA.id, "admin", admin.id), { id });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
