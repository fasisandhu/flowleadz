"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as notifications from "@/lib/services/notifications";

export async function listNotificationsAction(input: notifications.ListForUserInput = {}) {
  return withSessionContext((db, ctx) => notifications.listForUser(db, ctx, input));
}

export async function markNotificationsReadAction(input: notifications.MarkReadInput) {
  const result = await withSessionContext((db, ctx) => notifications.markRead(db, ctx, input));
  if (result.ok) revalidatePath("/customer/notifications", "page");
  return result;
}

export async function upsertNotificationPreferenceAction(input: notifications.UpsertPreferenceInput) {
  return withSessionContext((db, ctx) => notifications.upsertPreference(db, ctx, input));
}
