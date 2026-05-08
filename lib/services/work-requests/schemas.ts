import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);
export const workRequestStatusEnum = z.enum(["submitted", "accepted", "rejected", "duplicate"]);

export const submitWorkRequestInputSchema = z.object({
  title: nonEmptyStringSchema.max(200),
  description: z.string().max(10000).optional(),
  projectId: idSchema.optional(),
  priorityHint: priorityEnum.optional(),
});
export type SubmitWorkRequestInput = z.infer<typeof submitWorkRequestInputSchema>;
