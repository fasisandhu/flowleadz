import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import {
  createMembership,
  createOrg,
  createProject,
  createTask,
  createUser,
} from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import type { OrgContext } from "@/lib/services/_context";

// Mock R2 client BEFORE importing the service.
vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(async () => "https://r2.example.com/signed-put-url"),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(),
}));

import { presignPut } from "@/lib/storage/r2-client";
import { getUploadUrl } from "@/lib/services/attachments";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

beforeEach(() => {
  vi.mocked(presignPut).mockClear();
  vi.mocked(presignPut).mockResolvedValue("https://r2.example.com/signed-put-url");
});

describe("attachments.getUploadUrl", () => {
  it("admin can request upload URL for a daily_update they wrote; pending row inserted", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "x",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();

      const r = await getUploadUrl(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "daily_update",
        parentId: update!.id,
        filename: "screenshot.png",
        contentType: "image/png",
        sizeBytes: 12345,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.uploadUrl).toBe("https://r2.example.com/signed-put-url");
      expect(r.data.r2Key).toMatch(new RegExp(`^${org.id}/daily_update/[^/]+/screenshot\\.png$`));

      const rows = await db
        .select()
        .from(schema.attachments)
        .where(eq(schema.attachments.id, r.data.attachmentId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("pending");
      expect(rows[0]!.parentType).toBe("daily_update");
      expect(rows[0]!.parentId).toBe(update!.id);
      expect(rows[0]!.filename).toBe("screenshot.png");
      expect(rows[0]!.contentType).toBe("image/png");
      expect(Number(rows[0]!.sizeBytes)).toBe(12345);
      expect(rows[0]!.uploadedBy).toBe(admin.id);

      expect(presignPut).toHaveBeenCalledTimes(1);
      const [keyArg, ctArg, sizeArg] = vi.mocked(presignPut).mock.calls[0]!;
      expect(keyArg).toBe(rows[0]!.r2Key);
      expect(ctArg).toBe("image/png");
      expect(sizeArg).toBe(12345);
    });
  });

  it("customer can attach to their own work_request; non-submitter cannot", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const c1 = await createUser(db, { role: "customer" });
      const c2 = await createUser(db, { role: "customer" });
      await createMembership(db, c1.id, org.id);
      await createMembership(db, c2.id, org.id);
      const [request] = await db
        .insert(schema.workRequests)
        .values({
          orgId: org.id,
          submittedBy: c1.id,
          title: "wr",
          status: "submitted",
        })
        .returning();

      const ok1 = await getUploadUrl(db, ctxOf(org.id, "customer", c1.id), {
        parentType: "work_request",
        parentId: request!.id,
        filename: "spec.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      });
      expect(ok1.ok).toBe(true);

      const blocked = await getUploadUrl(db, ctxOf(org.id, "customer", c2.id), {
        parentType: "work_request",
        parentId: request!.id,
        filename: "spec.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024,
      });
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.error.code).toBe("unauthorized");
    });
  });

  it("rejects disallowed content type", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await getUploadUrl(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "task",
        parentId: task.id,
        filename: "evil.exe",
        contentType: "application/x-msdownload",
        sizeBytes: 1024,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("rejects oversized files", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, org.id, admin.id);
      const task = await createTask(db, org.id, project.id, admin.id);
      const r = await getUploadUrl(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "task",
        parentId: task.id,
        filename: "big.pdf",
        contentType: "application/pdf",
        sizeBytes: 100 * 1024 * 1024,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation");
    });
  });

  it("not_found if parent in another org", async () => {
    await withTransaction(async (db) => {
      const orgA = await createOrg(db);
      const orgB = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const project = await createProject(db, orgB.id, admin.id);
      const task = await createTask(db, orgB.id, project.id, admin.id);
      const r = await getUploadUrl(db, ctxOf(orgA.id, "admin", admin.id), {
        parentType: "task",
        parentId: task.id,
        filename: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("not_found");
    });
  });
});

afterAll(async () => {
  await closePool();
});
