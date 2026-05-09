"use server";

import { withSessionContext } from "./_action";
import * as tasks from "@/lib/services/tasks";

export async function listTasksAction(input: tasks.ListTasksInput = {}) {
  return withSessionContext((db, ctx) => tasks.listTasks(db, ctx, input));
}

export async function getTaskAction(id: string) {
  return withSessionContext((db, ctx) => tasks.getTask(db, ctx, id));
}
