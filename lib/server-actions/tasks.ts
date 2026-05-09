"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as tasks from "@/lib/services/tasks";

export async function listTasksAction(input: tasks.ListTasksInput = {}) {
  return withSessionContext((db, ctx) => tasks.listTasks(db, ctx, input));
}

export async function getTaskAction(id: string) {
  return withSessionContext((db, ctx) => tasks.getTask(db, ctx, id));
}

export async function changeTaskStatusAction(input: tasks.ChangeTaskStatusInput) {
  const result = await withSessionContext((db, ctx) => tasks.changeTaskStatus(db, ctx, input));
  if (result.ok) {
    revalidatePath("/employee/tasks", "page");
    revalidatePath("/employee/dashboard", "page");
    revalidatePath(`/employee/projects/.+`, "page");
    revalidatePath(`/customer/projects/.+`, "page");
  }
  return result;
}
