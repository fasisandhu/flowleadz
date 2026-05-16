"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as tasks from "@/lib/services/tasks";

export async function adminListTasksAction(orgId: string, input: tasks.ListTasksInput = {}) {
  return withSessionContext((db, ctx) => tasks.listTasks(db, ctx, input), { staffOrgId: orgId });
}

export async function adminCreateTaskAction(orgId: string, input: tasks.CreateTaskInput) {
  const r = await withSessionContext(
    (db, ctx) => tasks.createTask(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects/${input.projectId}`, "page");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
    revalidatePath("/employee/projects", "layout");
    revalidatePath("/employee/tasks", "page");
    revalidatePath("/customer/projects", "layout");
  }
  return r;
}

export async function adminGetTaskAction(orgId: string, id: string) {
  return withSessionContext((db, ctx) => tasks.getTask(db, ctx, id), { staffOrgId: orgId });
}

export async function adminAssignTaskAction(orgId: string, input: tasks.TaskAssignmentInput) {
  const r = await withSessionContext((db, ctx) => tasks.assignTask(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/tasks", "page");
    revalidatePath("/employee/dashboard", "page");
  }
  return r;
}

export async function adminUnassignTaskAction(orgId: string, input: tasks.TaskAssignmentInput) {
  const r = await withSessionContext((db, ctx) => tasks.unassignTask(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/tasks", "page");
  }
  return r;
}

export async function adminChangeTaskStatusAction(orgId: string, input: tasks.ChangeTaskStatusInput) {
  const r = await withSessionContext((db, ctx) => tasks.changeTaskStatus(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/tasks", "page");
  }
  return r;
}

export async function adminGetTaskActivityAction(orgId: string, taskId: string) {
  return withSessionContext(
    (db, ctx) => tasks.listActivityForTask(db, ctx, taskId),
    { staffOrgId: orgId },
  );
}

export async function adminListRecentActivityAction(orgId: string, limit: number = 20) {
  return withSessionContext(
    (db, ctx) => tasks.listRecentActivity(db, ctx, limit),
    { staffOrgId: orgId },
  );
}

export async function adminGetTaskAssigneesAction(orgId: string, taskId: string) {
  return withSessionContext(
    (db, ctx) => tasks.listTaskAssignees(db, ctx, taskId),
    { staffOrgId: orgId },
  );
}

export async function adminListTasksWithCardDataAction(
  orgId: string,
  input: { projectId?: string } = {},
) {
  return withSessionContext(
    (db, ctx) => tasks.listTasksWithCardData(db, ctx, input),
    { staffOrgId: orgId },
  );
}
