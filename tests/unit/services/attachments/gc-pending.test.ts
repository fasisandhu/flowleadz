import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createOrg, createProject, createTask, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";

vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(async () => undefined),
}));

import { deleteObject } from "@/lib/storage/r2-client";
import { gcPending } from "@/lib/services/attachments";

beforeEach(() => {
  vi.mocked(deleteObject).mockClear();
  vi.mocked(deleteObject).mockResolvedValue(undefined as never);
});

async function seedAttachment(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  parentId: string,
  uploadedBy: string,
  status: "pending" | "ready",
  createdAtOffsetMs: number,
) {
  const [row] = await db
    .insert(schema.attachments)
    .values({
      orgId,
      parentType: "task",
      parentId,
      uploadedBy,
      r2Key: `${orgId}/task/${Math.random()}/x.pdf`,
      filename: "x.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      status,
      createdAt: new Date(Date.now() + createdAtOffsetMs),
    })
    .returning();
  return row!;
}

describe("attachments.gcPending", () => {
  it("deletes pending rows older than 1 hour and calls R2 deleteObject; leaves ready rows alone", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);

      const old = await seedAttachment(db, org.id, task.id, admin.id, "pending", -2 * 60 * 60 * 1000);
      const recent = await seedAttachment(db, org.id, task.id, admin.id, "pending", -10 * 60 * 1000);
      const oldReady = await seedAttachment(db, org.id, task.id, admin.id, "ready", -2 * 60 * 60 * 1000);

      const r = await gcPending(db);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.deleted).toBe(1);

      const remaining = await db.select().from(schema.attachments);
      const ids = remaining.map((row) => row.id).sort();
      expect(ids).toEqual([recent.id, oldReady.id].sort());

      expect(deleteObject).toHaveBeenCalledTimes(1);
      expect(vi.mocked(deleteObject).mock.calls[0]![0]).toBe(old.r2Key);
    });
  });

  it("returns deleted=0 when nothing is stale", async () => {
    await withTransaction(async (db) => {
      const r = await gcPending(db);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.deleted).toBe(0);
      expect(deleteObject).not.toHaveBeenCalled();
    });
  });

  it("continues if R2 delete throws (best-effort)", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      await seedAttachment(db, org.id, task.id, admin.id, "pending", -2 * 60 * 60 * 1000);

      vi.mocked(deleteObject).mockRejectedValueOnce(new Error("R2 down"));

      const r = await gcPending(db);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.deleted).toBe(1);
      const remaining = await db.select().from(schema.attachments);
      expect(remaining).toHaveLength(0);
    });
  });
});

afterAll(async () => {
  await closePool();
});
