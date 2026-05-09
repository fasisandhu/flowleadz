import { z } from "zod";

export const emitInputSchema = z.object({
  orgId: z.string().min(1),
  eventType: z.string().min(1),
  recipientUserIds: z.array(z.string().min(1)).min(1),
  payload: z.record(z.string(), z.unknown()),
  relatedType: z.string().optional(),
  relatedId: z.string().optional(),
});

export type EmitInput = z.infer<typeof emitInputSchema>;

export const listForUserInputSchema = z.object({
  filter: z.enum(["all", "unread"]).optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});
export type ListForUserInput = z.infer<typeof listForUserInputSchema>;

import { idSchema } from "@/lib/services/_schemas/common";

export const markReadInputSchema = z.object({
  ids: z.array(idSchema).min(1, "At least one id is required"),
});
export type MarkReadInput = z.infer<typeof markReadInputSchema>;
