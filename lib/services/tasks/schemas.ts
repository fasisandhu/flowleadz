import { z } from "zod";
import { dateSchema, idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const taskStatusEnum = z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]);
export const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);

export const createTaskInputSchema = z.object({
  projectId: idSchema,
  title: nonEmptyStringSchema.max(200),
  description: z.string().max(10000).optional(),
  priority: priorityEnum.optional(),
  dueDate: dateSchema.optional(),
  customerVisible: z.boolean().optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;
