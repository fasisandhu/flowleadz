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

export const updateTaskInputSchema = z
  .object({
    id: idSchema,
    title: nonEmptyStringSchema.max(200).optional(),
    description: z.string().max(10000).nullable().optional(),
    priority: priorityEnum.optional(),
    dueDate: dateSchema.nullable().optional(),
    customerVisible: z.boolean().optional(),
  })
  .strict();
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const changeTaskStatusInputSchema = z.object({
  id: idSchema,
  toStatus: taskStatusEnum,
  note: z.string().max(500).optional(),
});
export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusInputSchema>;

export const ALLOWED_TASK_TRANSITIONS: Record<
  z.infer<typeof taskStatusEnum>,
  z.infer<typeof taskStatusEnum>[]
> = {
  todo: ["in_progress", "blocked", "cancelled", "done"],
  in_progress: ["todo", "blocked", "done", "cancelled"],
  blocked: ["todo", "in_progress", "cancelled"],
  done: ["in_progress"],
  cancelled: ["todo"],
};
