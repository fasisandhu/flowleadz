"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as reactions from "@/lib/services/reactions";

export async function toggleReactionAction(input: reactions.ToggleReactionInput) {
  const r = await withSessionContext((db, ctx) => reactions.toggleReaction(db, ctx, input));
  if (r.ok) {
    revalidatePath("/customer/tasks", "layout");
    revalidatePath("/employee/tasks", "layout");
    revalidatePath("/admin/orgs", "layout");
    revalidatePath("/customer/projects", "layout");
    revalidatePath("/employee/projects", "layout");
  }
  return r;
}

export async function listReactionsForCommentAction(commentId: string) {
  return withSessionContext((db, ctx) => reactions.listReactionsForComment(db, ctx, commentId));
}
