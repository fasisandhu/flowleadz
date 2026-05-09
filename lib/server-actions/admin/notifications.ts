"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as notifications from "@/lib/services/notifications";

export async function adminListNotificationsAction(orgId: string, input: notifications.ListNotificationsInput = {}) {
  return withSessionContext((db, ctx) => notifications.listForUser(db, ctx, input), { staffOrgId: orgId });
}

export async function adminMarkNotificationsReadAction(orgId: string, input: notifications.MarkNotificationsReadInput) {
  const r = await withSessionContext(
    (db, ctx) => notifications.markRead(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/notifications`, "page");
  return r;
}
