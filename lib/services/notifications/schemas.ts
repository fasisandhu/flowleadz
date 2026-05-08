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
