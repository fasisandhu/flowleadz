import { z } from "zod";
import { dateSchema, nonEmptyStringSchema, positiveIntSchema } from "@/lib/services/_schemas/common";

export const serviceTypeEnum = z.enum(["seo", "paid_ads", "social", "content", "web", "other"]);
export const projectStatusEnum = z.enum(["draft", "active", "paused", "completed", "archived"]);

export const createProjectInputSchema = z.object({
  name: nonEmptyStringSchema.max(200),
  description: z.string().max(5000).optional(),
  serviceType: serviceTypeEnum,
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  hourlyRateCents: positiveIntSchema.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

import { idSchema } from "@/lib/services/_schemas/common";

export const updateProjectInputSchema = z.object({
  id: idSchema,
  name: nonEmptyStringSchema.max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  serviceType: serviceTypeEnum.optional(),
  status: projectStatusEnum.optional(),
  startDate: dateSchema.nullable().optional(),
  endDate: dateSchema.nullable().optional(),
  hourlyRateCents: positiveIntSchema.nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const listProjectsInputSchema = z.object({
  status: projectStatusEnum.optional(),
});
export type ListProjectsInput = z.infer<typeof listProjectsInputSchema>;
