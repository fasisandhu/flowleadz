import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { z } from "zod";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { presignGet } from "@/lib/storage/r2-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

const updateProfileInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarAttachmentId: z.string().uuid().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export async function updateProfile(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateProfileInput,
): Promise<Result<{ id: string; name: string; image: string | null }>> {
  const parsed = updateProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", {
      fields: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.map(String).join("."), i.message]),
      ),
    });
  }

  const updates: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;

  if (parsed.data.avatarAttachmentId !== undefined) {
    const [row] = await db
      .select({
        id: schema.attachments.id,
        r2Key: schema.attachments.r2Key,
        uploadedBy: schema.attachments.uploadedBy,
        parentType: schema.attachments.parentType,
        parentId: schema.attachments.parentId,
        status: schema.attachments.status,
      })
      .from(schema.attachments)
      .where(eq(schema.attachments.id, parsed.data.avatarAttachmentId))
      .limit(1);
    if (!row) return err("not_found", "Avatar attachment not found");
    if (row.uploadedBy !== ctx.actor.userId) {
      return err("unauthorized", "Cannot use someone else's attachment");
    }
    if (row.parentType !== "user_avatar" || row.parentId !== ctx.actor.userId) {
      return err("validation", "Attachment is not a user_avatar for the current user");
    }
    if (row.status !== "ready") {
      return err("validation", "Avatar attachment is not yet confirmed");
    }
    const url = await presignGet(row.r2Key, 60 * 60 * 24 * 7); // 7 days
    updates.image = url;
  }

  const [updated] = await db
    .update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, ctx.actor.userId))
    .returning({
      id: schema.users.id,
      name: schema.users.name,
      image: schema.users.image,
    });
  if (!updated) return err("not_found", "User not found");
  return ok({ id: updated.id, name: updated.name ?? "", image: updated.image ?? null });
}
