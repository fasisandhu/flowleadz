"use server";

import { withSessionContext } from "./_action";
import * as attachments from "@/lib/services/attachments";

export async function getUploadUrlAction(input: attachments.GetUploadUrlInput) {
  return withSessionContext((db, ctx) => attachments.getUploadUrl(db, ctx, input));
}

export async function confirmAttachmentAction(input: attachments.ConfirmAttachmentInput) {
  return withSessionContext((db, ctx) => attachments.confirm(db, ctx, input));
}

export async function listAttachmentsForParentAction(input: attachments.ListForParentInput) {
  return withSessionContext((db, ctx) => attachments.listForParent(db, ctx, input));
}
