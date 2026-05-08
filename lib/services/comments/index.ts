import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireCommentWrite } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";
import { createCommentInputSchema, type CreateCommentInput } from "./schemas";
import { captureCommentRevision } from "./internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Comment = typeof schema.comments.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createComment(
  db: AnyDb,
  ctx: OrgContext,
  input: CreateCommentInput,
): Promise<Result<Comment>> {
  const parsed = createCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const auth = await requireCommentWrite(db, ctx, parsed.data.dailyUpdateId);
  if (!auth.ok) return auth;

  const [update] = await db
    .select({
      id: schema.dailyUpdates.id,
      orgId: schema.dailyUpdates.orgId,
      userId: schema.dailyUpdates.userId,
      visibility: schema.dailyUpdates.visibility,
    })
    .from(schema.dailyUpdates)
    .where(eq(schema.dailyUpdates.id, parsed.data.dailyUpdateId))
    .limit(1);
  if (!update) return err("not_found", "Daily update not found");

  const [row] = await db
    .insert(schema.comments)
    .values({
      orgId: ctx.orgId,
      dailyUpdateId: parsed.data.dailyUpdateId,
      userId: ctx.actor.userId,
      body: parsed.data.body,
    })
    .returning();

  // Recipients: update author + prior commenters (non-deleted), deduped, excluding actor.
  const recipients = new Set<string>();
  recipients.add(update.userId);

  const priorCommenters = await db
    .selectDistinct({ userId: schema.comments.userId })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.dailyUpdateId, parsed.data.dailyUpdateId),
        ne(schema.comments.id, row!.id),
        isNull(schema.comments.deletedAt),
      ),
    );
  priorCommenters.forEach((c) => recipients.add(c.userId));
  recipients.delete(ctx.actor.userId);

  let finalRecipients = Array.from(recipients);
  if (update.visibility === "internal_only" && finalRecipients.length > 0) {
    const userRoles = await db
      .select({ id: schema.users.id, systemRole: schema.users.systemRole })
      .from(schema.users)
      .where(inArray(schema.users.id, finalRecipients));
    const staffIds = new Set(
      userRoles.filter((u) => u.systemRole !== "customer").map((u) => u.id),
    );
    finalRecipients = finalRecipients.filter((id) => staffIds.has(id));
  }

  if (finalRecipients.length > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "comment.posted",
      recipientUserIds: finalRecipients,
      payload: {
        commentId: row!.id,
        dailyUpdateId: parsed.data.dailyUpdateId,
        actorId: ctx.actor.userId,
      },
      relatedType: "comment",
      relatedId: row!.id,
    });
  }

  return ok(row!);
}

export { captureCommentRevision };
