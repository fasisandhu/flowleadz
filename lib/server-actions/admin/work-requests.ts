"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as workRequests from "@/lib/services/work-requests";

export async function adminListWorkRequestsAction(orgId: string, input: workRequests.ListWorkRequestsInput = {}) {
  return withSessionContext((db, ctx) => workRequests.listWorkRequests(db, ctx, input), { staffOrgId: orgId });
}

export async function adminGetWorkRequestAction(orgId: string, id: string) {
  return withSessionContext((db, ctx) => workRequests.getWorkRequest(db, ctx, id), { staffOrgId: orgId });
}

export async function adminAcceptWorkRequestAction(orgId: string, input: workRequests.AcceptWorkRequestInput) {
  const r = await withSessionContext(
    (db, ctx) => workRequests.acceptWorkRequest(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/work-requests`, "layout");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
    revalidatePath("/customer/requests", "layout");
  }
  return r;
}

export async function adminRejectWorkRequestAction(orgId: string, input: workRequests.RejectWorkRequestInput) {
  const r = await withSessionContext(
    (db, ctx) => workRequests.rejectWorkRequest(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/work-requests`, "layout");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
    revalidatePath("/customer/requests", "layout");
  }
  return r;
}

export async function adminMarkDuplicateWorkRequestAction(orgId: string, input: workRequests.MarkDuplicateWorkRequestInput) {
  const r = await withSessionContext(
    (db, ctx) => workRequests.markDuplicateWorkRequest(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/work-requests`, "layout");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
    revalidatePath("/customer/requests", "layout");
  }
  return r;
}
