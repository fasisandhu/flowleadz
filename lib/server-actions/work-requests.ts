"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as workRequests from "@/lib/services/work-requests";

export async function submitWorkRequestAction(input: workRequests.SubmitWorkRequestInput) {
  const result = await withSessionContext((db, ctx) => workRequests.submitWorkRequest(db, ctx, input));
  if (result.ok) revalidatePath("/customer/requests", "page");
  return result;
}

export async function listWorkRequestsAction(input: workRequests.ListWorkRequestsInput = {}) {
  return withSessionContext((db, ctx) => workRequests.listWorkRequests(db, ctx, input));
}

export async function getWorkRequestAction(id: string) {
  return withSessionContext((db, ctx) => workRequests.getWorkRequest(db, ctx, id));
}
