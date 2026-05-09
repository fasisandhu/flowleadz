import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { presignPut } from "@/lib/storage/r2-client";
import {
  getUploadUrlInputSchema,
  type GetUploadUrlInput,
} from "./schemas";
import { authorizeAttachmentParentWrite, buildR2Key } from "./internal";

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
