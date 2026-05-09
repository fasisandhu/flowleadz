import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const systemRoleEnum = z.enum(["customer", "employee", "admin"]);

export const inviteUserInputSchema = z
  .object({
    email: z.string().email(),
    name: z.string().max(200).optional(),
    systemRole: systemRoleEnum,
    orgId: idSchema.optional(),
  })
  .refine(
    (v) => (v.systemRole === "customer" ? !!v.orgId : !v.orgId),
    {
      message: "Customer invitations require orgId; staff invitations must omit it",
      path: ["orgId"],
    },
  );
export type InviteUserInput = z.infer<typeof inviteUserInputSchema>;

export const acceptInvitationInputSchema = z.object({
  token: nonEmptyStringSchema.max(256),
  password: z.string().min(12).max(256),
  name: nonEmptyStringSchema.max(200),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;

export const listOrgMembersInputSchema = z.object({
  orgId: idSchema,
});
export type ListOrgMembersInput = z.infer<typeof listOrgMembersInputSchema>;
