"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as dailyUpdates from "@/lib/services/daily-updates";

export async function listDailyUpdatesAction(input: dailyUpdates.ListDailyUpdatesInput = {}) {
  return withSessionContext((db, ctx) => dailyUpdates.listDailyUpdates(db, ctx, input));
}

export async function getDailyUpdateAction(id: string) {
  return withSessionContext((db, ctx) => dailyUpdates.getDailyUpdate(db, ctx, id));
}

export async function listDailyUpdateRevisionsAction(id: string) {
  return withSessionContext((db, ctx) => dailyUpdates.listDailyUpdateRevisions(db, ctx, id));
}

export async function createDailyUpdateAction(input: dailyUpdates.CreateDailyUpdateInput) {
  const result = await withSessionContext((db, ctx) => dailyUpdates.createDailyUpdate(db, ctx, input));
  if (result.ok) {
    revalidatePath("/employee/dashboard", "page");
    revalidatePath(`/employee/projects/${input.projectId}`, "page");
    revalidatePath(`/customer/projects/${input.projectId}`, "page");
  }
  return result;
}

export async function adminCreateDailyUpdateAction(
  orgId: string,
  input: dailyUpdates.CreateDailyUpdateInput,
) {
  const result = await withSessionContext(
    (db, ctx) => dailyUpdates.createDailyUpdate(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (result.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects/${input.projectId}`, "page");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
  }
  return result;
}

export async function updateDailyUpdateAction(input: dailyUpdates.UpdateDailyUpdateInput) {
  const result = await withSessionContext((db, ctx) => dailyUpdates.updateDailyUpdate(db, ctx, input));
  if (result.ok) {
    revalidatePath("/employee/projects", "layout");
    revalidatePath("/customer/projects", "layout");
  }
  return result;
}

export async function adminUpdateDailyUpdateAction(
  orgId: string,
  input: dailyUpdates.UpdateDailyUpdateInput,
) {
  const result = await withSessionContext(
    (db, ctx) => dailyUpdates.updateDailyUpdate(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (result.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
  }
  return result;
}
