"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as comments from "@/lib/services/comments";

export async function postCommentAction(input: comments.PostCommentInput) {
  const r = await withSessionContext((db, ctx) => comments.postComment(db, ctx, input));
  if (r.ok) {
    revalidatePath("/customer/projects", "layout");
    revalidatePath("/employee/projects", "layout");
    revalidatePath("/customer/tasks", "layout");
    revalidatePath("/employee/tasks", "layout");
    revalidatePath("/admin/orgs", "layout");
  }
  return r;
}

// Keep old name for backward compatibility
export const createCommentAction = postCommentAction;

export async function listCommentsAction(input: comments.ListCommentsInput) {
  return withSessionContext((db, ctx) => comments.listComments(db, ctx, input));
}

export async function softDeleteCommentAction(input: comments.SoftDeleteCommentInput) {
  return withSessionContext((db, ctx) => comments.softDeleteComment(db, ctx, input));
}
