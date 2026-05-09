import { z } from "zod";
import { idSchema, nonEmptyStringSchema, positiveIntSchema } from "@/lib/services/_schemas/common";

export const attachmentParentTypeEnum = z.enum([
  "daily_update",
  "work_request",
  "task",
  "comment",
]);

export type AttachmentParentType = z.infer<typeof attachmentParentTypeEnum>;

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

export const getUploadUrlInputSchema = z.object({
  parentType: attachmentParentTypeEnum,
  parentId: idSchema,
  filename: nonEmptyStringSchema.max(255),
  contentType: z.string().refine((s) => ALLOWED_MIME_TYPES.has(s), "Disallowed content type"),
  sizeBytes: positiveIntSchema.max(MAX_SIZE_BYTES, `File exceeds ${MAX_SIZE_BYTES} byte limit`),
});
export type GetUploadUrlInput = z.infer<typeof getUploadUrlInputSchema>;

export const confirmAttachmentInputSchema = z.object({
  id: idSchema,
});
export type ConfirmAttachmentInput = z.infer<typeof confirmAttachmentInputSchema>;

export const listForParentInputSchema = z.object({
  parentType: attachmentParentTypeEnum,
  parentId: idSchema,
});
export type ListForParentInput = z.infer<typeof listForParentInputSchema>;
