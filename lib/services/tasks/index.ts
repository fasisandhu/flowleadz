import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireOrgAccess, requireRole, requireTaskRead, requireTaskWrite } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { emit } from "@/lib/services/notifications";
import {
  createTaskInputSchema, type CreateTaskInput,
  updateTaskInputSchema, type UpdateTaskInput,
  changeTaskStatusInputSchema, type ChangeTaskStatusInput,
  ALLOWED_TASK_TRANSITIONS,
  taskAssignmentInputSchema, type TaskAssignmentInput,
  listTasksInputSchema, type ListTasksInput,
} from "./schemas";

export type { ListTasksInput, CreateTaskInput, UpdateTaskInput, ChangeTaskStatusInput, TaskAssignmentInput } from "./schemas";
import { logStatusTransition } from "./internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Task = typeof schema.tasks.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function createTask(
  db: AnyDb,
  ctx: OrgContext,
  input: CreateTaskInput,
): Promise<Result<Task>> {
  const parsed = createTaskInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  const [project] = await db
    .select({ id: schema.projects.id, orgId: schema.projects.orgId })
    .from(schema.projects)
    .where(eq(schema.projects.id, parsed.data.projectId))
    .limit(1);
  if (!project) return err("not_found", "Project not found");
  if (project.orgId !== ctx.orgId) return err("not_found", "Project not found");

  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId: ctx.orgId,
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      priority: parsed.data.priority ?? "normal",
      dueDate: parsed.data.dueDate ?? null,
      customerVisible: parsed.data.customerVisible ?? true,
      source: "admin_created",
      sourceRequestId: null,
      createdBy: ctx.actor.userId,
    })
    .returning();
  await logStatusTransition(db, row!.id, null, "todo", ctx.actor.userId);
  return ok(row!);
}

export type CreateFromRequestInput = {
  orgId: string;
  projectId: string | null;
  title: string;
  description?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  sourceRequestId: string;
  createdBy: string;
};

/**
 * Internal-but-exported helper. Called by work-requests.submit (Plan 2b)
 * inside the same transaction. NOT a public Server Action — the caller
 * already authorized.
 */
export async function createFromRequest(db: AnyDb, input: CreateFromRequestInput): Promise<Task> {
  const [row] = await db
    .insert(schema.tasks)
    .values({
      orgId: input.orgId,
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "normal",
      customerVisible: true,
      source: "from_request",
      sourceRequestId: input.sourceRequestId,
      createdBy: input.createdBy,
    })
    .returning();
  await logStatusTransition(db, row!.id, null, "todo", input.createdBy);
  return row!;
}

export async function updateTask(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateTaskInput,
): Promise<Result<Task>> {
  const parsed = updateTaskInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const auth = await requireTaskWrite(db, ctx, parsed.data.id);
  if (!auth.ok) return auth;

  const updates: Partial<typeof schema.tasks.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
  if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate;
  if (parsed.data.customerVisible !== undefined) updates.customerVisible = parsed.data.customerVisible;

  const [row] = await db
    .update(schema.tasks)
    .set(updates)
    .where(eq(schema.tasks.id, parsed.data.id))
    .returning();
  return ok(row!);
}

export async function changeTaskStatus(
  db: AnyDb,
  ctx: OrgContext,
  input: ChangeTaskStatusInput,
): Promise<Result<Task>> {
  const parsed = changeTaskStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const auth = await requireTaskWrite(db, ctx, parsed.data.id);
  if (!auth.ok) return auth;

  const [task] = await db
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parsed.data.id))
    .limit(1);
  if (!task) return err("not_found", "Task not found");

  if (task.status === parsed.data.toStatus) return ok(task);

  const allowed = ALLOWED_TASK_TRANSITIONS[task.status as keyof typeof ALLOWED_TASK_TRANSITIONS] ?? [];
  if (!allowed.includes(parsed.data.toStatus)) {
    return err("validation", `Cannot transition from ${task.status} to ${parsed.data.toStatus}`, {
      fields: { toStatus: "illegal transition" },
    });
  }

  const statusUpdates: Partial<typeof schema.tasks.$inferInsert> = {
    status: parsed.data.toStatus,
    updatedAt: new Date(),
  };
  if (parsed.data.toStatus === "done") statusUpdates.completedAt = new Date();
  if (task.status === "done" && parsed.data.toStatus !== "done") statusUpdates.completedAt = null;

  const [updated] = await db
    .update(schema.tasks)
    .set(statusUpdates)
    .where(eq(schema.tasks.id, parsed.data.id))
    .returning();
  await logStatusTransition(db, updated!.id, task.status, parsed.data.toStatus, ctx.actor.userId, parsed.data.note);

  // Emit: assignees + (if customer-visible) customers in org. Exclude actor.
  const assignees = await db
    .select({ userId: schema.taskAssignments.userId })
    .from(schema.taskAssignments)
    .where(eq(schema.taskAssignments.taskId, parsed.data.id));
  const recipientIds = new Set<string>(assignees.map((a) => a.userId));
  if (updated!.customerVisible) {
    const customers = await db
      .select({ userId: schema.members.userId })
      .from(schema.members)
      .where(eq(schema.members.organizationId, ctx.orgId));
    customers.forEach((c) => recipientIds.add(c.userId));
  }
  recipientIds.delete(ctx.actor.userId);
  if (recipientIds.size > 0) {
    await emit(db, {
      orgId: ctx.orgId,
      eventType: "task.status_changed",
      recipientUserIds: Array.from(recipientIds),
      payload: {
        taskId: updated!.id,
        title: updated!.title,
        from: task.status,
        to: parsed.data.toStatus,
        actorId: ctx.actor.userId,
      },
      relatedType: "task",
      relatedId: updated!.id,
    });
  }

  return ok(updated!);
}

export async function assignTask(
  db: AnyDb,
  ctx: OrgContext,
  input: TaskAssignmentInput,
): Promise<Result<true>> {
  const parsed = taskAssignmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const auth = await requireTaskWrite(db, ctx, parsed.data.taskId);
  if (!auth.ok) return auth;

  const [user] = await db
    .select({ id: schema.users.id, systemRole: schema.users.systemRole })
    .from(schema.users)
    .where(eq(schema.users.id, parsed.data.userId))
    .limit(1);
  if (!user) return err("not_found", "User not found");
  if (user.systemRole === "customer") {
    return err("validation", "Cannot assign tasks to customers", { fields: { userId: "Customers cannot be assigned" } });
  }

  const [existing] = await db
    .select()
    .from(schema.taskAssignments)
    .where(
      and(
        eq(schema.taskAssignments.taskId, parsed.data.taskId),
        eq(schema.taskAssignments.userId, parsed.data.userId),
      ),
    )
    .limit(1);
  if (existing) return ok(true);

  await db
    .insert(schema.taskAssignments)
    .values({ taskId: parsed.data.taskId, userId: parsed.data.userId });

  const [task] = await db
    .select({ title: schema.tasks.title })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parsed.data.taskId))
    .limit(1);

  await emit(db, {
    orgId: ctx.orgId,
    eventType: "task.assigned",
    recipientUserIds: [parsed.data.userId],
    payload: {
      taskId: parsed.data.taskId,
      title: task?.title ?? "(unknown)",
      actorId: ctx.actor.userId,
    },
    relatedType: "task",
    relatedId: parsed.data.taskId,
  });

  return ok(true);
}

export async function unassignTask(
  db: AnyDb,
  ctx: OrgContext,
  input: TaskAssignmentInput,
): Promise<Result<true>> {
  const parsed = taskAssignmentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const auth = await requireTaskWrite(db, ctx, parsed.data.taskId);
  if (!auth.ok) return auth;

  await db
    .delete(schema.taskAssignments)
    .where(
      and(
        eq(schema.taskAssignments.taskId, parsed.data.taskId),
        eq(schema.taskAssignments.userId, parsed.data.userId),
      ),
    );
  return ok(true);
}

export async function listTasks(
  db: AnyDb,
  ctx: OrgContext,
  input: ListTasksInput,
): Promise<Result<Task[]>> {
  const parsed = listTasksInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const conditions = [eq(schema.tasks.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(schema.tasks.status, parsed.data.status));
  if (parsed.data.projectId) conditions.push(eq(schema.tasks.projectId, parsed.data.projectId));

  if (ctx.actor.role === "customer") {
    conditions.push(eq(schema.tasks.customerVisible, true));
    conditions.push(isNotNull(schema.tasks.projectId));
  }

  if (ctx.actor.role === "employee") {
    const assigned = await db
      .select({ projectId: schema.projectAssignments.projectId })
      .from(schema.projectAssignments)
      .where(eq(schema.projectAssignments.userId, ctx.actor.userId));
    const ids = assigned.map((r) => r.projectId);
    if (ids.length === 0) return ok([]);
    conditions.push(inArray(schema.tasks.projectId, ids));
  }

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(...conditions))
    .orderBy(schema.tasks.createdAt);
  return ok(rows);
}

export async function getTask(
  db: AnyDb,
  ctx: OrgContext,
  taskId: string,
): Promise<Result<Task>> {
  const access = await requireTaskRead(db, ctx, taskId);
  if (!access.ok) return access;
  const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
  if (!row) return err("not_found", "Task not found");
  return ok(row);
}
