import { and, eq, inArray, lt } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { presignPut, presignGet, headObject, deleteObject } from "@/lib/storage/r2-client";
import { log } from "@/lib/log";
import {
  getUploadUrlInputSchema,
  type GetUploadUrlInput,
  confirmAttachmentInputSchema,
  type ConfirmAttachmentInput,
  listForParentInputSchema,
  type ListForParentInput,
} from "./schemas";
import { authorizeAttachmentParentWrite, authorizeAttachmentParentRead, buildR2Key } from "./internal";

export type { GetUploadUrlInput, ConfirmAttachmentInput, ListForParentInput } from "./schemas";

type Attachment = typeof schema.attachments.$inferSelect;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export type GetUploadUrlResult = {
  attachmentId: string;
  uploadUrl: string;
  r2Key: string;
};

export async function getUploadUrl(
  db: AnyDb,
  ctx: OrgContext,
  input: GetUploadUrlInput,
): Promise<Result<GetUploadUrlResult>> {
  const parsed = getUploadUrlInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  if (parsed.data.parentType === "user_avatar") {
    const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
    if (!imageTypes.has(parsed.data.contentType)) {
      return err("validation", "Avatar must be PNG, JPEG, WebP, or GIF", {
        fields: { contentType: "Image format required" },
      });
    }
    const fiveMB = 5 * 1024 * 1024;
    if (parsed.data.sizeBytes > fiveMB) {
      return err("validation", "Avatar exceeds the 5 MB limit", {
        fields: { sizeBytes: "Max 5 MB" },
      });
    }
  }

  const auth = await authorizeAttachmentParentWrite(
    db,
    ctx,
    parsed.data.parentType,
    parsed.data.parentId,
  );
  if (!auth.ok) return auth;

  // Insert pending row first so we can use its UUID v7 in the r2 key.
  const [row] = await db
    .insert(schema.attachments)
    .values({
      orgId: ctx.orgId,
      parentType: parsed.data.parentType,
      parentId: parsed.data.parentId,
      uploadedBy: ctx.actor.userId,
      r2Key: "pending",
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
      status: "pending",
    })
    .returning();

  const r2Key = buildR2Key(
    ctx.orgId,
    parsed.data.parentType,
    row!.id,
    parsed.data.filename,
  );

  await db
    .update(schema.attachments)
    .set({ r2Key })
    .where(eq(schema.attachments.id, row!.id));

  const uploadUrl = await presignPut(r2Key, parsed.data.contentType, parsed.data.sizeBytes);

  return ok({ attachmentId: row!.id, uploadUrl, r2Key });
}

export async function confirm(
  db: AnyDb,
  ctx: OrgContext,
  input: ConfirmAttachmentInput,
): Promise<Result<Attachment>> {
  const parsed = confirmAttachmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const [existing] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Attachment not found");
  if (existing.orgId !== ctx.orgId) return err("not_found", "Attachment not found");

  if (ctx.actor.role !== "admin" && existing.uploadedBy !== ctx.actor.userId) {
    return err("unauthorized", "Only the uploader or an admin can confirm this attachment");
  }

  if (existing.status === "ready") return ok(existing);

  let head: { ContentLength?: number };
  try {
    head = await headObject(existing.r2Key);
  } catch {
    await db
      .update(schema.attachments)
      .set({ status: "failed" })
      .where(eq(schema.attachments.id, parsed.data.id));
    return err("not_found", "Object not found in R2");
  }

  const expectedSize = Number(existing.sizeBytes);
  if (head.ContentLength !== expectedSize) {
    await db
      .update(schema.attachments)
      .set({ status: "failed" })
      .where(eq(schema.attachments.id, parsed.data.id));
    return err("validation", `Size mismatch: expected ${expectedSize}, got ${head.ContentLength}`);
  }

  const [row] = await db
    .update(schema.attachments)
    .set({ status: "ready", confirmedAt: new Date() })
    .where(eq(schema.attachments.id, parsed.data.id))
    .returning();
  return ok(row!);
}

export async function gcPending(db: AnyDb): Promise<Result<{ deleted: number }>> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);

  const stale = await db
    .select({ id: schema.attachments.id, r2Key: schema.attachments.r2Key })
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.status, "pending"),
        lt(schema.attachments.createdAt, cutoff),
      ),
    );

  if (stale.length === 0) return ok({ deleted: 0 });

  for (const row of stale) {
    try {
      await deleteObject(row.r2Key);
    } catch (e) {
      log.warn({ err: e, r2Key: row.r2Key }, "gcPending: R2 deleteObject failed (continuing)");
    }
  }

  const ids = stale.map((row) => row.id);
  await db.delete(schema.attachments).where(inArray(schema.attachments.id, ids));

  return ok({ deleted: stale.length });
}

export async function listForParent(
  db: AnyDb,
  ctx: OrgContext,
  input: ListForParentInput,
): Promise<Result<Attachment[]>> {
  const parsed = listForParentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const auth = await authorizeAttachmentParentRead(
    db,
    ctx,
    parsed.data.parentType,
    parsed.data.parentId,
  );
  if (!auth.ok) return auth;

  const rows = await db
    .select()
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.parentType, parsed.data.parentType),
        eq(schema.attachments.parentId, parsed.data.parentId),
        eq(schema.attachments.status, "ready"),
      ),
    )
    .orderBy(schema.attachments.createdAt);
  return ok(rows);
}

export type GetDownloadUrlInput = { id: string };

export async function getDownloadUrl(
  db: AnyDb,
  ctx: OrgContext,
  input: GetDownloadUrlInput,
): Promise<Result<{ url: string; filename: string; contentType: string }>> {
  const [row] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, input.id))
    .limit(1);
  if (!row) return err("not_found", "Attachment not found");
  if (row.orgId !== ctx.orgId) return err("not_found", "Attachment not found");
  if (row.status !== "ready") return err("not_found", "Attachment not ready");

  const auth = await authorizeAttachmentParentRead(db, ctx, row.parentType, row.parentId);
  if (!auth.ok) return auth;

  const url = await presignGet(row.r2Key, 900);
  return ok({ url, filename: row.filename, contentType: row.contentType });
}
