import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { inviteUserInputSchema, type InviteUserInput, acceptInvitationInputSchema, type AcceptInvitationInput } from "./schemas";
import { generateInvitationToken, hashUserPassword } from "./internal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export type InviteUserResult = {
  id: string;
  token: string;
  acceptUrl: string;
};

export async function inviteUser(
  db: AnyDb,
  ctx: OrgContext,
  input: InviteUserInput,
): Promise<Result<InviteUserResult>> {
  const parsed = inviteUserInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;

  if (parsed.data.orgId) {
    const [orgRow] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, parsed.data.orgId))
      .limit(1);
    if (!orgRow) return err("not_found", "Organization not found");
  }

  const [existing] = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.email, parsed.data.email),
        eq(schema.invitations.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    return err("conflict", "An active invitation for this email already exists");
  }

  const token = generateInvitationToken();
  const id = `inv_${token.slice(0, 24)}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(schema.invitations).values({
    id,
    email: parsed.data.email,
    organizationId: parsed.data.orgId ?? null,
    inviterId: ctx.actor.userId,
    role: parsed.data.systemRole === "customer" ? "member" : null,
    systemRole: parsed.data.systemRole,
    status: "pending",
    expiresAt,
  });

  const acceptUrl = `${env.APP_URL}/signup?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`;
  log.info({ email: parsed.data.email, acceptUrl }, "User invitation created");

  return ok({ id, token, acceptUrl });
}

type User = typeof schema.users.$inferSelect;

export async function acceptInvitation(
  db: AnyDb,
  input: AcceptInvitationInput,
): Promise<Result<User>> {
  const parsed = acceptInvitationInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const expectedId = `inv_${parsed.data.token.slice(0, 24)}`;

  const [invitation] = await db
    .select()
    .from(schema.invitations)
    .where(eq(schema.invitations.id, expectedId))
    .limit(1);
  if (!invitation) return err("not_found", "Invitation not found");

  if (invitation.status !== "pending") {
    return err("conflict", `Invitation has status '${invitation.status}'`);
  }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return err("conflict", "Invitation has expired");
  }
  if (!invitation.systemRole) {
    return err("server", "Invitation row missing systemRole — cannot accept");
  }

  const passwordHash = await hashUserPassword(parsed.data.password);

  const userIdPrefix =
    invitation.systemRole === "customer"
      ? "usr_cust"
      : invitation.systemRole === "admin"
        ? "usr_admin"
        : "usr_emp";
  const userId = `${userIdPrefix}_${parsed.data.token.slice(0, 16)}`;

  const [user] = await db
    .insert(schema.users)
    .values({
      id: userId,
      email: invitation.email,
      name: parsed.data.name,
      emailVerified: true,
      systemRole: invitation.systemRole,
    })
    .returning();

  await db.insert(schema.accounts).values({
    id: `acc_${userId}`,
    userId,
    accountId: invitation.email,
    providerId: "credential",
    password: passwordHash,
  });

  if (invitation.systemRole === "customer" && invitation.organizationId) {
    await db.insert(schema.members).values({
      id: `mbr_${userId}`,
      userId,
      organizationId: invitation.organizationId,
      role: invitation.role ?? "member",
    });
  }

  await db
    .update(schema.invitations)
    .set({ status: "accepted" })
    .where(eq(schema.invitations.id, invitation.id));

  return ok(user!);
}
