"use server";

import { withSessionContext } from "./_action";
import * as attachments from "@/lib/services/attachments";

export async function getUploadUrlAction(input: attachments.GetUploadUrlInput) {
  return withSessionContext((db, ctx) => attachments.getUploadUrl(db, ctx, input));
}

export async function adminGetUploadUrlAction(
  orgId: string,
  input: attachments.GetUploadUrlInput,
) {
  return withSessionContext(
    (db, ctx) => attachments.getUploadUrl(db, ctx, input),
    { staffOrgId: orgId },
  );
}

export async function confirmAttachmentAction(input: attachments.ConfirmAttachmentInput) {
  return withSessionContext((db, ctx) => attachments.confirm(db, ctx, input));
}

export async function adminConfirmAttachmentAction(
  orgId: string,
  input: attachments.ConfirmAttachmentInput,
) {
  return withSessionContext(
    (db, ctx) => attachments.confirm(db, ctx, input),
    { staffOrgId: orgId },
  );
}

export async function listAttachmentsForParentAction(input: attachments.ListForParentInput) {
  return withSessionContext((db, ctx) => attachments.listForParent(db, ctx, input));
}

export async function adminListAttachmentsForParentAction(
  orgId: string,
  input: attachments.ListForParentInput,
) {
  return withSessionContext(
    (db, ctx) => attachments.listForParent(db, ctx, input),
    { staffOrgId: orgId },
  );
}

export async function getAttachmentDownloadUrlAction(input: { id: string }) {
  return withSessionContext((db, ctx) => attachments.getDownloadUrl(db, ctx, input));
}

export async function adminGetAttachmentDownloadUrlAction(orgId: string, input: { id: string }) {
  return withSessionContext(
    (db, ctx) => attachments.getDownloadUrl(db, ctx, input),
    { staffOrgId: orgId },
  );
}
