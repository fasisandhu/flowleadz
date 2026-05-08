import { z } from "zod";
import { dateSchema, idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const activityTypeEnum = z.enum([
  "planning",
  "execution",
  "review",
  "meeting",
  "admin",
  "other",
]);

export const updateVisibilityEnum = z.enum(["customer_visible", "internal_only"]);

function notInFuture(s: string): boolean {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return s <= todayUtc;
}

export const createDailyUpdateInputSchema = z.object({
  projectId: idSchema,
  body: nonEmptyStringSchema.max(20000),
  activityType: activityTypeEnum,
  visibility: updateVisibilityEnum.optional(),
  logDate: dateSchema.refine(notInFuture, "logDate cannot be in the future"),
  taskIds: z.array(idSchema).optional(),
});
export type CreateDailyUpdateInput = z.infer<typeof createDailyUpdateInputSchema>;

export const updateDailyUpdateInputSchema = z
  .object({
    id: idSchema,
    body: nonEmptyStringSchema.max(20000).optional(),
    activityType: activityTypeEnum.optional(),
    visibility: updateVisibilityEnum.optional(),
  })
  .strict();
export type UpdateDailyUpdateInput = z.infer<typeof updateDailyUpdateInputSchema>;
