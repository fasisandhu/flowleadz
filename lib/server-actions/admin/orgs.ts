"use server";

import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/better-auth/config";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import * as orgsService from "@/lib/services/orgs";

/**
 * Admin-only: list all organizations.
 *
 * This wrapper does not use `withSessionContext` because admins without a
 * picked org can't construct an OrgContext. We do the role check inline using
 * the Better Auth session + the user's systemRole, then call the service with
 * a synthetic admin context using the first org id (any will do — the service
 * only checks the actor's role, then returns all orgs).
 */
export async function adminListOrgsAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false as const, error: { code: "unauthorized" as const, message: "Not signed in" } };

  const [user] = await db
    .select({ systemRole: schema.users.systemRole })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user || user.systemRole !== "admin") {
    return { ok: false as const, error: { code: "unauthorized" as const, message: "Admin role required" } };
  }

  const [firstOrg] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .limit(1);
  if (!firstOrg) return { ok: true as const, data: [] };

  return orgsService.listOrgs(db, {
    kind: "org",
    orgId: firstOrg.id,
    actor: { userId: session.user.id, role: "admin", membershipOrgId: null },
  });
}
