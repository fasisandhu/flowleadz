import { and, asc, eq, isNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireCommentWrite, requireCommentRead } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import type { OrgContext } from "@/lib/services/_context";
import {
  postCommentInputSchema,
  type PostCommentInput,
  listCommentsInputSchema,
  type ListCommentsInput,
  updateCommentInputSchema,
  type UpdateCommentInput,
  softDeleteCommentInputSchema,
  type SoftDeleteCommentInput,
} from "./schemas";
import { captureCommentRevision } from "./internal";

export type {
  PostCommentInput,
  ListCommentsInput,
  UpdateCommentInput,
  SoftDeleteCommentInput,
  CommentParentType,
} from "./schemas";

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

export async function postComment(
  db: AnyDb,
  ctx: OrgContext,
  input: PostCommentInput,
): Promise<Result<Comment>> {
  const parsed = postCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const access = await requireCommentWrite(db, ctx, parsed.data.parentType, parsed.data.parentId);
  if (!access.ok) return access;

  if (parsed.data.parentCommentId) {
    const [parent] = await db
      .select({
        parentType: schema.comments.parentType,
        parentId: schema.comments.parentId,
      })
      .from(schema.comments)
      .where(eq(schema.comments.id, parsed.data.parentCommentId))
      .limit(1);
    if (!parent) return err("not_found", "Parent comment not found");
    if (
      parent.parentType !== parsed.data.parentType ||
      parent.parentId !== parsed.data.parentId
    ) {
      return err("validation", "Cannot reply across parents");
    }
  }

  const [row] = await db
    .insert(schema.comments)
    .values({
      parentType: parsed.data.parentType,
      parentId: parsed.data.parentId,
      parentCommentId: parsed.data.parentCommentId ?? null,
      userId: ctx.actor.userId,
      body: parsed.data.body,
    })
    .returning();

  // Notify other participants.
  const recipients = await collectParticipants(
    db,
    parsed.data.parentType,
    parsed.data.parentId,
    ctx.actor.userId,
  );
  const projectId = await resolveProjectId(db, parsed.data.parentType, parsed.data.parentId);
  if (recipients.length > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "comment.posted",
      recipientUserIds: recipients,
      payload: {
        commentId: row!.id,
        parentType: parsed.data.parentType,
        parentId: parsed.data.parentId,
        projectId,
        actorId: ctx.actor.userId,
      },
      relatedType: "comment",
      relatedId: row!.id,
    });
  }

  return ok(row!);
}

// Keep the old name as an alias for backward compatibility in tests.
export const createComment = postComment;

export { captureCommentRevision };

export async function updateComment(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateCommentInput,
): Promise<Result<Comment>> {
  const parsed = updateCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const [existing] = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Comment not found");
  if (existing.deletedAt) return err("not_found", "Comment not found");

  if (ctx.actor.role !== "admin" && existing.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the author or an admin can edit this comment");
  }

  if (parsed.data.body === existing.body) {
    return ok(existing);
  }

  await captureCommentRevision(db, existing, ctx.actor.userId);

  const [row] = await db
    .update(schema.comments)
    .set({ body: parsed.data.body, updatedAt: new Date() })
    .where(eq(schema.comments.id, parsed.data.id))
    .returning();
  return ok(row!);
}

export async function softDeleteComment(
  db: AnyDb,
  ctx: OrgContext,
  input: SoftDeleteCommentInput,
): Promise<Result<true>> {
  const parsed = softDeleteCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const [existing] = await db
    .select()
    .from(schema.comments)
    .where(eq(schema.comments.id, parsed.data.id))
    .limit(1);
  if (!existing) return err("not_found", "Comment not found");

  if (ctx.actor.role !== "admin" && existing.userId !== ctx.actor.userId) {
    return err("unauthorized", "Only the author or an admin can delete this comment");
  }

  await db
    .update(schema.comments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.comments.id, parsed.data.id));
  return ok(true);
}

export async function listComments(
  db: AnyDb,
  ctx: OrgContext,
  input: ListCommentsInput,
): Promise<Result<Comment[]>> {
  const parsed = listCommentsInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const access = await requireCommentRead(db, ctx, parsed.data.parentType, parsed.data.parentId);
  if (!access.ok) return access;
  const rows = await db
    .select()
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.parentType, parsed.data.parentType),
        eq(schema.comments.parentId, parsed.data.parentId),
      ),
    )
    .orderBy(asc(schema.comments.createdAt), asc(schema.comments.id));
  return ok(rows);
}

async function collectParticipants(
  db: AnyDb,
  parentType: "daily_update" | "task",
  parentId: string,
  excludeUserId: string,
): Promise<string[]> {
  if (parentType === "daily_update") {
    const author = await db
      .select({ id: schema.dailyUpdates.userId })
      .from(schema.dailyUpdates)
      .where(eq(schema.dailyUpdates.id, parentId))
      .limit(1);
    const otherCommenters = await db
      .selectDistinct({ id: schema.comments.userId })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.parentType, "daily_update"),
          eq(schema.comments.parentId, parentId),
          isNull(schema.comments.deletedAt),
        ),
      );
    const ids = new Set<string>();
    if (author[0]) ids.add(author[0].id);
    for (const c of otherCommenters) ids.add(c.id);
    ids.delete(excludeUserId);
    return Array.from(ids);
  }
  // task
  const creator = await db
    .select({ id: schema.tasks.createdBy })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parentId))
    .limit(1);
  const assignees = await db
    .select({ id: schema.taskAssignments.userId })
    .from(schema.taskAssignments)
    .where(eq(schema.taskAssignments.taskId, parentId));
  const otherCommenters = await db
    .selectDistinct({ id: schema.comments.userId })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.parentType, "task"),
        eq(schema.comments.parentId, parentId),
        isNull(schema.comments.deletedAt),
      ),
    );
  const ids = new Set<string>();
  if (creator[0]) ids.add(creator[0].id);
  for (const a of assignees) ids.add(a.id);
  for (const c of otherCommenters) ids.add(c.id);
  ids.delete(excludeUserId);
  return Array.from(ids);
}

async function resolveProjectId(
  db: AnyDb,
  parentType: "daily_update" | "task",
  parentId: string,
): Promise<string | undefined> {
  if (parentType === "daily_update") {
    const [row] = await db
      .select({ projectId: schema.dailyUpdates.projectId })
      .from(schema.dailyUpdates)
      .where(eq(schema.dailyUpdates.id, parentId))
      .limit(1);
    return row?.projectId ?? undefined;
  }
  const [row] = await db
    .select({ projectId: schema.tasks.projectId })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parentId))
    .limit(1);
  return row?.projectId ?? undefined;
}
