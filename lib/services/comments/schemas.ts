import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const createCommentInputSchema = z.object({
  dailyUpdateId: idSchema,
  body: nonEmptyStringSchema.max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

export const updateCommentInputSchema = z
  .object({
    id: idSchema,
    body: nonEmptyStringSchema.max(10000),
  })
  .strict();
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;

export const softDeleteCommentInputSchema = z.object({ id: idSchema });
export type SoftDeleteCommentInput = z.infer<typeof softDeleteCommentInputSchema>;
