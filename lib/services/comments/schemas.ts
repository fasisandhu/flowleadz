import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const commentParentTypeEnum = z.enum(["daily_update", "task"]);
export type CommentParentType = z.infer<typeof commentParentTypeEnum>;

export const postCommentInputSchema = z.object({
  parentType: commentParentTypeEnum,
  parentId: idSchema,
  parentCommentId: idSchema.optional(),
  body: nonEmptyStringSchema.max(5000),
});
export type PostCommentInput = z.infer<typeof postCommentInputSchema>;

export const listCommentsInputSchema = z.object({
  parentType: commentParentTypeEnum,
  parentId: idSchema,
});
export type ListCommentsInput = z.infer<typeof listCommentsInputSchema>;

export const updateCommentInputSchema = z
  .object({
    id: idSchema,
    body: nonEmptyStringSchema.max(10000),
  })
  .strict();
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;

export const softDeleteCommentInputSchema = z.object({ id: idSchema });
export type SoftDeleteCommentInput = z.infer<typeof softDeleteCommentInputSchema>;
