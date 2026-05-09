import { afterAll, describe, expect, it, vi } from "vitest";
import { closePool, withTransaction } from "@/tests/fixtures/db";
import { createMembership, createOrg, createProject, createUser } from "@/tests/fixtures/factories";
import * as schema from "@/lib/db/schema";
import type { OrgContext } from "@/lib/services/_context";

vi.mock("@/lib/storage/r2-client", () => ({
  presignPut: vi.fn(),
  presignGet: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(),
}));

import { listForParent } from "@/lib/services/attachments";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

async function seedAttachment(
  db: Parameters<typeof createUser>[0],
  orgId: string,
  parentType: "daily_update" | "task" | "comment" | "work_request",
  parentId: string,
  uploadedBy: string,
  filename: string,
  status: "pending" | "ready" | "failed" = "ready",
) {
  const [row] = await db
    .insert(schema.attachments)
    .values({
      orgId,
      parentType,
      parentId,
      uploadedBy,
      r2Key: `${orgId}/${parentType}/${Math.random()}/${filename}`,
      filename,
      contentType: "application/pdf",
      sizeBytes: 100,
      status,
    })
    .returning();
  return row!;
}

describe("attachments.listForParent", () => {
  it("returns ready attachments, excluding pending and failed", async () => {
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
          body: "u",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-08",
        })
        .returning();
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "ready.pdf", "ready");
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "pending.pdf", "pending");
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "failed.pdf", "failed");

      const r = await listForParent(db, ctxOf(org.id, "admin", admin.id), {
        parentType: "daily_update",
        parentId: update!.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.map((a) => a.filename)).toEqual(["ready.pdf"]);
    });
  });

  it("customer can list ready attachments on a customer_visible update", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
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
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "shared.pdf");

      const r = await listForParent(db, ctxOf(org.id, "customer", customer.id), {
        parentType: "daily_update",
        parentId: update!.id,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data).toHaveLength(1);
    });
  });

  it("customer cannot list attachments on internal_only updates", async () => {
    await withTransaction(async (db) => {
      const org = await createOrg(db);
      const admin = await createUser(db, { role: "admin" });
      const customer = await createUser(db, { role: "customer" });
      await createMembership(db, customer.id, org.id);
      const project = await createProject(db, org.id, admin.id);
      const [update] = await db
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          userId: admin.id,
          body: "u",
          activityType: "execution",
          visibility: "internal_only",
          logDate: "2026-05-08",
        })
        .returning();
      await seedAttachment(db, org.id, "daily_update", update!.id, admin.id, "secret.pdf");

      const r = await listForParent(db, ctxOf(org.id, "customer", customer.id), {
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
