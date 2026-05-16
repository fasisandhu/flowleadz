"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as timeEntries from "@/lib/services/time-entries";

export async function logTimeAction(input: timeEntries.LogTimeInput) {
  const result = await withSessionContext((db, ctx) => timeEntries.logTime(db, ctx, input));
  if (result.ok) {
    revalidatePath("/employee/time", "page");
    revalidatePath("/employee/dashboard", "page");
  }
  return result;
}

export async function adminLogTimeAction(orgId: string, input: timeEntries.LogTimeInput) {
  const result = await withSessionContext(
    (db, ctx) => timeEntries.logTime(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (result.ok) {
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
  }
  return result;
}

export async function listTimeEntriesAction(input: timeEntries.ListTimeEntriesInput = {}) {
  return withSessionContext((db, ctx) =>
    timeEntries.listTimeEntries(db, ctx, { userId: ctx.actor.userId, ...input }),
  );
}

export async function updateTimeEntryAction(input: timeEntries.UpdateTimeEntryInput) {
  const result = await withSessionContext((db, ctx) => timeEntries.updateTimeEntry(db, ctx, input));
  if (result.ok) revalidatePath("/employee/time", "page");
  return result;
}

export async function deleteTimeEntryAction(input: timeEntries.DeleteTimeEntryInput) {
  const result = await withSessionContext((db, ctx) => timeEntries.deleteTimeEntry(db, ctx, input));
  if (result.ok) revalidatePath("/employee/time", "page");
  return result;
}
