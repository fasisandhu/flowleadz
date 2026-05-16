import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireCommentRead } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { toggleReactionInputSchema, type ToggleReactionInput } from "./schemas";

export type { ToggleReactionInput, Emoji } from "./schemas";
export { ALLOWED_EMOJIS } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function toggleReaction(
  db: AnyDb,
  ctx: OrgContext,
  input: ToggleReactionInput,
): Promise<Result<{ active: boolean }>> {
  const parsed = toggleReactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", {
      fields: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.map(String).join("."), i.message]),
      ),
    });
  }

  const [comment] = await db
    .select({
      id: schema.comments.id,
      parentType: schema.comments.parentType,
      parentId: schema.comments.parentId,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, parsed.data.commentId))
    .limit(1);
  if (!comment) return err("not_found", "Comment not found");

  const access = await requireCommentRead(
    db,
    ctx,
    comment.parentType as "daily_update" | "task",
    comment.parentId,
  );
  if (!access.ok) return access;

  const [existing] = await db
    .select({ commentId: schema.commentReactions.commentId })
    .from(schema.commentReactions)
    .where(
      and(
        eq(schema.commentReactions.commentId, parsed.data.commentId),
        eq(schema.commentReactions.userId, ctx.actor.userId),
        eq(schema.commentReactions.emoji, parsed.data.emoji),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(schema.commentReactions)
      .where(
        and(
          eq(schema.commentReactions.commentId, parsed.data.commentId),
          eq(schema.commentReactions.userId, ctx.actor.userId),
          eq(schema.commentReactions.emoji, parsed.data.emoji),
        ),
      );
    return ok({ active: false });
  }

  await db.insert(schema.commentReactions).values({
    commentId: parsed.data.commentId,
    userId: ctx.actor.userId,
    emoji: parsed.data.emoji,
  });
  return ok({ active: true });
}

export type ReactionAggregate = { emoji: string; count: number; mine: boolean };

export async function listReactionsForComment(
  db: AnyDb,
  ctx: OrgContext,
  commentId: string,
): Promise<Result<ReactionAggregate[]>> {
  const [comment] = await db
    .select({
      id: schema.comments.id,
      parentType: schema.comments.parentType,
      parentId: schema.comments.parentId,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId))
    .limit(1);
  if (!comment) return err("not_found", "Comment not found");

  const access = await requireCommentRead(
    db,
    ctx,
    comment.parentType as "daily_update" | "task",
    comment.parentId,
  );
  if (!access.ok) return access;

  const rows = await db
    .select({
      emoji: schema.commentReactions.emoji,
      userId: schema.commentReactions.userId,
    })
    .from(schema.commentReactions)
    .where(eq(schema.commentReactions.commentId, commentId));

  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === ctx.actor.userId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  const out: ReactionAggregate[] = [];
  for (const [emoji, agg] of byEmoji.entries()) {
    out.push({ emoji, count: agg.count, mine: agg.mine });
  }
  return ok(out);
}
