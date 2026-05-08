import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const createCommentInputSchema = z.object({
  dailyUpdateId: idSchema,
  body: nonEmptyStringSchema.max(10000),
});
export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
