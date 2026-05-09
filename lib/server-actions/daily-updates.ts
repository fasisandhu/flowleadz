"use server";

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
