"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as tasks from "@/lib/services/tasks";

export async function adminListTasksAction(orgId: string, input: tasks.ListTasksInput = {}) {
  return withSessionContext((db, ctx) => tasks.listTasks(db, ctx, input), { staffOrgId: orgId });
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
