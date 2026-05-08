import { z } from "zod";
import { dateSchema, idSchema, positiveIntSchema } from "@/lib/services/_schemas/common";

export const logTimeInputSchema = z.object({
  taskId: idSchema,
  minutes: positiveIntSchema,
  loggedForDate: dateSchema,
  note: z.string().max(2000).optional(),
});
export type LogTimeInput = z.infer<typeof logTimeInputSchema>;
