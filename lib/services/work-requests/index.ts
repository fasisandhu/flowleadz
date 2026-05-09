import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireOrgAccess } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import { createFromRequest } from "@/lib/services/tasks";
import type { OrgContext } from "@/lib/services/_context";
import { submitWorkRequestInputSchema, type SubmitWorkRequestInput, acceptWorkRequestInputSchema, type AcceptWorkRequestInput, rejectWorkRequestInputSchema, type RejectWorkRequestInput, markDuplicateWorkRequestInputSchema, type MarkDuplicateWorkRequestInput, listWorkRequestsInputSchema, type ListWorkRequestsInput } from "./schemas";
import { requireRole } from "@/lib/services/_auth/predicates";
import { logRequestStatusTransition } from "./internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type WorkRequest = typeof schema.workRequests.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function submitWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: SubmitWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = submitWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  if (parsed.data.projectId) {
    const [project] = await db
      .select({ id: schema.projects.id, orgId: schema.projects.orgId })
      .from(schema.projects)
      .where(eq(schema.projects.id, parsed.data.projectId))
      .limit(1);
    if (!project) return err("not_found", "Project not found");
    if (project.orgId !== ctx.orgId) return err("not_found", "Project not found");
  }

  // 1. Insert work_request first.
  const [request] = await db
    .insert(schema.workRequests)
    .values({
      orgId: ctx.orgId,
      submittedBy: ctx.actor.userId,
      projectId: parsed.data.projectId ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priorityHint: parsed.data.priorityHint ?? "normal",
      status: "submitted",
    })
    .returning();

  // 2. Auto-create task.
  const task = await createFromRequest(db, {
    orgId: ctx.orgId,
    projectId: request!.projectId,
    title: request!.title,
    description: request!.description ?? undefined,
    priority: request!.priorityHint,
    sourceRequestId: request!.id,
    createdBy: ctx.actor.userId,
  });

  // 3. Update with task id.
  const [updated] = await db
    .update(schema.workRequests)
    .set({ resolvedTaskId: task.id, updatedAt: new Date() })
    .where(eq(schema.workRequests.id, request!.id))
    .returning();

  // 4. Status log.
  await logRequestStatusTransition(db, request!.id, null, "submitted", ctx.actor.userId);

  // 5. Notify all admins (excluding actor).
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.systemRole, "admin"));
  const adminIds = admins.map((a) => a.id).filter((id) => id !== ctx.actor.userId);
  if (adminIds.length > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.submitted",
      recipientUserIds: adminIds,
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}

export async function acceptWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: AcceptWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = acceptWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [request] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, parsed.data.id))
    .limit(1);
  if (!request) return err("not_found", "Work request not found");
  if (request.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  if (request.status !== "submitted") {
    return err("conflict", `Cannot accept a request with status '${request.status}'`);
  }

  let finalProjectId = request.projectId;
  if (!finalProjectId) {
    if (!parsed.data.projectId) {
      return err("validation", "projectId is required when the request has no project", {
        fields: { projectId: "Required to accept a triage request" },
      });
    }
    const [project] = await db
      .select({ id: schema.projects.id, orgId: schema.projects.orgId })
      .from(schema.projects)
      .where(eq(schema.projects.id, parsed.data.projectId))
      .limit(1);
    if (!project || project.orgId !== ctx.orgId) {
      return err("not_found", "Project not found");
    }
    finalProjectId = parsed.data.projectId;
  }

  const [updated] = await db
    .update(schema.workRequests)
    .set({
      status: "accepted",
      projectId: finalProjectId,
      reviewedBy: ctx.actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workRequests.id, parsed.data.id))
    .returning();

  if (request.resolvedTaskId) {
    const [task] = await db
      .select({ id: schema.tasks.id, projectId: schema.tasks.projectId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, request.resolvedTaskId))
      .limit(1);
    if (task && !task.projectId) {
      await db
        .update(schema.tasks)
        .set({ projectId: finalProjectId, updatedAt: new Date() })
        .where(eq(schema.tasks.id, task.id));
    }
  }

  await logRequestStatusTransition(db, parsed.data.id, "submitted", "accepted", ctx.actor.userId);

  if (request.submittedBy !== ctx.actor.userId) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.status_changed",
      recipientUserIds: [request.submittedBy],
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        from: "submitted",
        to: "accepted",
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}

async function cancelLinkedTask(
  db: AnyDb,
  taskId: string,
  changedBy: string,
  note: string,
) {
  const [task] = await db
    .select({ status: schema.tasks.status })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .limit(1);
  if (!task) return;
  if (task.status === "cancelled") return;
  await db
    .update(schema.tasks)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(schema.tasks.id, taskId));
  await db.insert(schema.taskStatusLog).values({
    taskId,
    fromStatus: task.status,
    toStatus: "cancelled",
    changedBy,
    note,
  });
}

export async function rejectWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: RejectWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = rejectWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [request] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, parsed.data.id))
    .limit(1);
  if (!request) return err("not_found", "Work request not found");
  if (request.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  if (request.status !== "submitted") {
    return err("conflict", `Cannot reject a request with status '${request.status}'`);
  }

  const [updated] = await db
    .update(schema.workRequests)
    .set({
      status: "rejected",
      rejectionReason: parsed.data.reason,
      reviewedBy: ctx.actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workRequests.id, parsed.data.id))
    .returning();

  if (request.resolvedTaskId) {
    await cancelLinkedTask(db, request.resolvedTaskId, ctx.actor.userId, `Request rejected: ${parsed.data.reason}`);
  }

  await logRequestStatusTransition(db, parsed.data.id, "submitted", "rejected", ctx.actor.userId, parsed.data.reason);

  if (request.submittedBy !== ctx.actor.userId) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.status_changed",
      recipientUserIds: [request.submittedBy],
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        from: "submitted",
        to: "rejected",
        reason: parsed.data.reason,
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}

export async function markDuplicateWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  input: MarkDuplicateWorkRequestInput,
): Promise<Result<WorkRequest>> {
  const parsed = markDuplicateWorkRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [request] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, parsed.data.id))
    .limit(1);
  if (!request) return err("not_found", "Work request not found");
  if (request.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  if (request.status !== "submitted") {
    return err("conflict", `Cannot mark duplicate on a request with status '${request.status}'`);
  }

  const [canonical] = await db
    .select({ id: schema.tasks.id, orgId: schema.tasks.orgId, title: schema.tasks.title })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parsed.data.canonicalTaskId))
    .limit(1);
  if (!canonical || canonical.orgId !== ctx.orgId) {
    return err("not_found", "Canonical task not found");
  }

  const reason = `Duplicate of task ${canonical.id} (${canonical.title})`;

  const [updated] = await db
    .update(schema.workRequests)
    .set({
      status: "duplicate",
      rejectionReason: reason,
      reviewedBy: ctx.actor.userId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.workRequests.id, parsed.data.id))
    .returning();

  if (request.resolvedTaskId) {
    await cancelLinkedTask(db, request.resolvedTaskId, ctx.actor.userId, reason);
  }

  await logRequestStatusTransition(db, parsed.data.id, "submitted", "duplicate", ctx.actor.userId, reason);

  if (request.submittedBy !== ctx.actor.userId) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "work_request.status_changed",
      recipientUserIds: [request.submittedBy],
      payload: {
        workRequestId: updated!.id,
        title: updated!.title,
        from: "submitted",
        to: "duplicate",
        reason,
        canonicalTaskId: canonical.id,
        actorId: ctx.actor.userId,
      },
      relatedType: "work_request",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}

export async function listWorkRequests(
  db: AnyDb,
  ctx: OrgContext,
  input: ListWorkRequestsInput,
): Promise<Result<WorkRequest[]>> {
  const parsed = listWorkRequestsInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const conditions = [eq(schema.workRequests.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(schema.workRequests.status, parsed.data.status));

  if (ctx.actor.role === "employee") {
    const assigned = await db
      .select({ projectId: schema.projectAssignments.projectId })
      .from(schema.projectAssignments)
      .where(eq(schema.projectAssignments.userId, ctx.actor.userId));
    const ids = assigned.map((r) => r.projectId);
    if (ids.length === 0) {
      conditions.push(isNull(schema.workRequests.projectId));
    } else {
      conditions.push(
        or(isNull(schema.workRequests.projectId), inArray(schema.workRequests.projectId, ids))!,
      );
    }
  }

  const rows = await db
    .select()
    .from(schema.workRequests)
    .where(and(...conditions))
    .orderBy(desc(schema.workRequests.createdAt));
  return ok(rows);
}

export async function getWorkRequest(
  db: AnyDb,
  ctx: OrgContext,
  id: string,
): Promise<Result<WorkRequest>> {
  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;
  const [row] = await db
    .select()
    .from(schema.workRequests)
    .where(eq(schema.workRequests.id, id))
    .limit(1);
  if (!row) return err("not_found", "Work request not found");
  if (row.orgId !== ctx.orgId) return err("not_found", "Work request not found");
  return ok(row);
}
