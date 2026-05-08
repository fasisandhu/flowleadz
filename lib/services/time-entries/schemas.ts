import { z } from "zod";
import { dateSchema, idSchema, positiveIntSchema } from "@/lib/services/_schemas/common";

export const logTimeInputSchema = z.object({
  taskId: idSchema,
  minutes: positiveIntSchema,
  loggedForDate: dateSchema,
  note: z.string().max(2000).optional(),
});
export type LogTimeInput = z.infer<typeof logTimeInputSchema>;

export const listTimeEntriesInputSchema = z.object({
  projectId: idSchema.optional(),
  taskId: idSchema.optional(),
  userId: idSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
});
export type ListTimeEntriesInput = z.infer<typeof listTimeEntriesInputSchema>;

export const updateTimeEntryInputSchema = z
  .object({
    id: idSchema,
    minutes: positiveIntSchema.optional(),
    loggedForDate: dateSchema.optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .strict();
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntryInputSchema>;

export const deleteTimeEntryInputSchema = z.object({ id: idSchema });
export type DeleteTimeEntryInput = z.infer<typeof deleteTimeEntryInputSchema>;
