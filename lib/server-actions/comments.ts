"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as comments from "@/lib/services/comments";

export async function createCommentAction(input: comments.CreateCommentInput) {
  const result = await withSessionContext((db, ctx) => comments.createComment(db, ctx, input));
  if (result.ok) {
    // Refresh the daily-update detail page so the new comment shows immediately.
    revalidatePath(`/customer/projects/.+/updates/${input.dailyUpdateId}`, "page");
  }
  return result;
}

export async function listCommentsAction(dailyUpdateId: string) {
  return withSessionContext((db, ctx) => comments.listComments(db, ctx, dailyUpdateId));
}

export async function softDeleteCommentAction(input: comments.SoftDeleteCommentInput) {
  return withSessionContext((db, ctx) => comments.softDeleteComment(db, ctx, input));
}
