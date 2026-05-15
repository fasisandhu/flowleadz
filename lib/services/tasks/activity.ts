import { and, desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { ok, type Result } from "@/lib/services/_result";
import { requireTaskRead } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import type { TaskStatus } from "@/lib/constants/status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export type ActivityEvent =
  | {
      kind: "update";
      id: string;
      taskId: string;
      createdAt: Date | string;
      authorId: string;
      authorName: string;
      authorEmail: string;
      body: string;
      activityType: string;
      visibility: "customer_visible" | "internal_only";
    }
  | {
      kind: "status_change";
      id: string;
      taskId: string;
      createdAt: Date | string;
      actorId: string;
      actorName: string;
      actorEmail: string;
      fromStatus: TaskStatus | null;
      toStatus: TaskStatus;
    }
  | {
      kind: "time_log";
      id: string;
      taskId: string;
      createdAt: Date | string;
      actorId: string;
      actorName: string;
      actorEmail: string;
      minutes: number;
      note: string | null;
    }
  | {
      kind: "comment";
      id: string;
      taskId: string;
      createdAt: Date | string;
      authorId: string;
      authorName: string;
      authorEmail: string;
      body: string;
      parentUpdateId: string;
    }
  | {
      kind: "attachment";
      id: string;
      taskId: string;
      createdAt: Date | string;
      uploaderId: string;
      uploaderName: string;
      uploaderEmail: string;
      filename: string;
      sizeBytes: number;
      attachmentId: string;
    };

export async function listActivityForTask(
  db: AnyDb,
  ctx: OrgContext,
  taskId: string,
): Promise<Result<ActivityEvent[]>> {
  const access = await requireTaskRead(db, ctx, taskId);
  if (!access.ok) return access;

  const [updates, comments, statusEvents, timeEvents, attachments] = await Promise.all([
    db
      .select({
        id: schema.dailyUpdates.id,
        createdAt: schema.dailyUpdates.createdAt,
        authorId: schema.dailyUpdates.userId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.dailyUpdates.body,
        activityType: schema.dailyUpdates.activityType,
        visibility: schema.dailyUpdates.visibility,
      })
      .from(schema.dailyUpdates)
      .innerJoin(
        schema.dailyUpdateTasks,
        eq(schema.dailyUpdateTasks.dailyUpdateId, schema.dailyUpdates.id),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.dailyUpdates.userId))
      .where(eq(schema.dailyUpdateTasks.taskId, taskId)),
    db
      .select({
        id: schema.comments.id,
        createdAt: schema.comments.createdAt,
        authorId: schema.comments.userId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.comments.body,
        parentUpdateId: schema.comments.dailyUpdateId,
      })
      .from(schema.comments)
      .innerJoin(
        schema.dailyUpdateTasks,
        eq(schema.dailyUpdateTasks.dailyUpdateId, schema.comments.dailyUpdateId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.userId))
      .where(eq(schema.dailyUpdateTasks.taskId, taskId)),
    db
      .select({
        id: schema.taskStatusLog.id,
        createdAt: schema.taskStatusLog.changedAt,
        actorId: schema.taskStatusLog.changedBy,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        fromStatus: schema.taskStatusLog.fromStatus,
        toStatus: schema.taskStatusLog.toStatus,
      })
      .from(schema.taskStatusLog)
      .innerJoin(schema.users, eq(schema.users.id, schema.taskStatusLog.changedBy))
      .where(eq(schema.taskStatusLog.taskId, taskId)),
    db
      .select({
        id: schema.timeEntries.id,
        createdAt: schema.timeEntries.createdAt,
        actorId: schema.timeEntries.userId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        minutes: schema.timeEntries.minutes,
        note: schema.timeEntries.note,
      })
      .from(schema.timeEntries)
      .innerJoin(schema.users, eq(schema.users.id, schema.timeEntries.userId))
      .where(eq(schema.timeEntries.taskId, taskId)),
    db
      .select({
        id: schema.attachments.id,
        createdAt: schema.attachments.createdAt,
        uploaderId: schema.attachments.uploadedBy,
        uploaderName: schema.users.name,
        uploaderEmail: schema.users.email,
        filename: schema.attachments.filename,
        sizeBytes: schema.attachments.sizeBytes,
      })
      .from(schema.attachments)
      .innerJoin(schema.users, eq(schema.users.id, schema.attachments.uploadedBy))
      .where(
        and(
          eq(schema.attachments.parentType, "task"),
          eq(schema.attachments.parentId, taskId),
          eq(schema.attachments.status, "ready"),
        ),
      ),
  ]);

  const filteredUpdates =
    ctx.actor.role === "customer"
      ? updates.filter((u) => u.visibility === "customer_visible")
      : updates;
  const visibleUpdateIds = new Set(filteredUpdates.map((u) => u.id));
  const filteredComments = comments.filter((c) => visibleUpdateIds.has(c.parentUpdateId));

  const events: ActivityEvent[] = [
    ...filteredUpdates.map((u) => ({
      kind: "update" as const,
      id: u.id,
      taskId,
      createdAt: u.createdAt,
      authorId: u.authorId,
      authorName: u.authorName ?? "",
      authorEmail: u.authorEmail,
      body: u.body,
      activityType: u.activityType,
      visibility: u.visibility as "customer_visible" | "internal_only",
    })),
    ...filteredComments.map((c) => ({
      kind: "comment" as const,
      id: c.id,
      taskId,
      createdAt: c.createdAt,
      authorId: c.authorId,
      authorName: c.authorName ?? "",
      authorEmail: c.authorEmail,
      body: c.body,
      parentUpdateId: c.parentUpdateId,
    })),
    ...statusEvents.map((s) => ({
      kind: "status_change" as const,
      id: s.id,
      taskId,
      createdAt: s.createdAt,
      actorId: s.actorId,
      actorName: s.actorName ?? "",
      actorEmail: s.actorEmail,
      fromStatus: s.fromStatus as TaskStatus | null,
      toStatus: s.toStatus as TaskStatus,
    })),
    ...timeEvents.map((t) => ({
      kind: "time_log" as const,
      id: t.id,
      taskId,
      createdAt: t.createdAt,
      actorId: t.actorId,
      actorName: t.actorName ?? "",
      actorEmail: t.actorEmail,
      minutes: t.minutes,
      note: t.note,
    })),
    ...attachments.map((a) => ({
      kind: "attachment" as const,
      id: a.id,
      taskId,
      createdAt: a.createdAt,
      uploaderId: a.uploaderId,
      uploaderName: a.uploaderName ?? "",
      uploaderEmail: a.uploaderEmail,
      filename: a.filename,
      sizeBytes: Number(a.sizeBytes),
      attachmentId: a.id,
    })),
  ];

  events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta - tb;
  });

  return ok(events);
}

export async function listRecentActivity(
  db: AnyDb,
  ctx: OrgContext,
  limit: number,
): Promise<Result<ActivityEvent[]>> {
  const taskRows = await (async () => {
    if (ctx.actor.role === "admin") {
      return db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(eq(schema.tasks.orgId, ctx.orgId));
    }
    if (ctx.actor.role === "employee") {
      return db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .innerJoin(
          schema.projectAssignments,
          eq(schema.projectAssignments.projectId, schema.tasks.projectId),
        )
        .where(
          and(
            eq(schema.tasks.orgId, ctx.orgId),
            eq(schema.projectAssignments.userId, ctx.actor.userId),
          ),
        );
    }
    return db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(eq(schema.tasks.orgId, ctx.orgId));
  })();

  const taskIds = Array.from(new Set(taskRows.map((r) => r.id)));
  if (taskIds.length === 0) return ok([]);

  const [updates, comments, statusEvents, timeEvents, attachments] = await Promise.all([
    db
      .select({
        id: schema.dailyUpdates.id,
        createdAt: schema.dailyUpdates.createdAt,
        authorId: schema.dailyUpdates.userId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.dailyUpdates.body,
        activityType: schema.dailyUpdates.activityType,
        visibility: schema.dailyUpdates.visibility,
        taskId: schema.dailyUpdateTasks.taskId,
      })
      .from(schema.dailyUpdates)
      .innerJoin(
        schema.dailyUpdateTasks,
        eq(schema.dailyUpdateTasks.dailyUpdateId, schema.dailyUpdates.id),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.dailyUpdates.userId))
      .where(inArray(schema.dailyUpdateTasks.taskId, taskIds))
      .orderBy(desc(schema.dailyUpdates.createdAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.comments.id,
        createdAt: schema.comments.createdAt,
        authorId: schema.comments.userId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.comments.body,
        parentUpdateId: schema.comments.dailyUpdateId,
        taskId: schema.dailyUpdateTasks.taskId,
      })
      .from(schema.comments)
      .innerJoin(
        schema.dailyUpdateTasks,
        eq(schema.dailyUpdateTasks.dailyUpdateId, schema.comments.dailyUpdateId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.userId))
      .where(inArray(schema.dailyUpdateTasks.taskId, taskIds))
      .orderBy(desc(schema.comments.createdAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.taskStatusLog.id,
        createdAt: schema.taskStatusLog.changedAt,
        actorId: schema.taskStatusLog.changedBy,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        fromStatus: schema.taskStatusLog.fromStatus,
        toStatus: schema.taskStatusLog.toStatus,
        taskId: schema.taskStatusLog.taskId,
      })
      .from(schema.taskStatusLog)
      .innerJoin(schema.users, eq(schema.users.id, schema.taskStatusLog.changedBy))
      .where(inArray(schema.taskStatusLog.taskId, taskIds))
      .orderBy(desc(schema.taskStatusLog.changedAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.timeEntries.id,
        createdAt: schema.timeEntries.createdAt,
        actorId: schema.timeEntries.userId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        minutes: schema.timeEntries.minutes,
        note: schema.timeEntries.note,
        taskId: schema.timeEntries.taskId,
      })
      .from(schema.timeEntries)
      .innerJoin(schema.users, eq(schema.users.id, schema.timeEntries.userId))
      .where(inArray(schema.timeEntries.taskId, taskIds))
      .orderBy(desc(schema.timeEntries.createdAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.attachments.id,
        createdAt: schema.attachments.createdAt,
        uploaderId: schema.attachments.uploadedBy,
        uploaderName: schema.users.name,
        uploaderEmail: schema.users.email,
        filename: schema.attachments.filename,
        sizeBytes: schema.attachments.sizeBytes,
        taskId: schema.attachments.parentId,
      })
      .from(schema.attachments)
      .innerJoin(schema.users, eq(schema.users.id, schema.attachments.uploadedBy))
      .where(
        and(
          eq(schema.attachments.parentType, "task"),
          inArray(schema.attachments.parentId, taskIds),
          eq(schema.attachments.status, "ready"),
        ),
      )
      .orderBy(desc(schema.attachments.createdAt))
      .limit(limit * 2),
  ]);

  const filteredUpdates =
    ctx.actor.role === "customer"
      ? updates.filter((u) => u.visibility === "customer_visible")
      : updates;
  const visibleUpdateIds = new Set(filteredUpdates.map((u) => u.id));
  const filteredComments = comments.filter((c) => visibleUpdateIds.has(c.parentUpdateId));

  const events: ActivityEvent[] = [
    ...filteredUpdates.map((u) => ({
      kind: "update" as const,
      id: u.id,
      taskId: u.taskId,
      createdAt: u.createdAt,
      authorId: u.authorId,
      authorName: u.authorName ?? "",
      authorEmail: u.authorEmail,
      body: u.body,
      activityType: u.activityType,
      visibility: u.visibility as "customer_visible" | "internal_only",
    })),
    ...filteredComments.map((c) => ({
      kind: "comment" as const,
      id: c.id,
      taskId: c.taskId,
      createdAt: c.createdAt,
      authorId: c.authorId,
      authorName: c.authorName ?? "",
      authorEmail: c.authorEmail,
      body: c.body,
      parentUpdateId: c.parentUpdateId,
    })),
    ...statusEvents.map((s) => ({
      kind: "status_change" as const,
      id: s.id,
      taskId: s.taskId,
      createdAt: s.createdAt,
      actorId: s.actorId,
      actorName: s.actorName ?? "",
      actorEmail: s.actorEmail,
      fromStatus: s.fromStatus as TaskStatus | null,
      toStatus: s.toStatus as TaskStatus,
    })),
    ...timeEvents.map((t) => ({
      kind: "time_log" as const,
      id: t.id,
      taskId: t.taskId,
      createdAt: t.createdAt,
      actorId: t.actorId,
      actorName: t.actorName ?? "",
      actorEmail: t.actorEmail,
      minutes: t.minutes,
      note: t.note,
    })),
    ...attachments.map((a) => ({
      kind: "attachment" as const,
      id: a.id,
      taskId: a.taskId,
      createdAt: a.createdAt,
      uploaderId: a.uploaderId,
      uploaderName: a.uploaderName ?? "",
      uploaderEmail: a.uploaderEmail,
      filename: a.filename,
      sizeBytes: Number(a.sizeBytes),
      attachmentId: a.id,
    })),
  ];

  events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  return ok(events.slice(0, limit));
}
