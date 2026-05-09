import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { db } from "@/lib/db/client";
import { buildOrgContext } from "@/lib/services/_auth/build-context";
import { err, type Result, type AppError } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import type { Db } from "@/lib/db/client";

/**
 * Wraps a service-layer call with session lookup + OrgContext building.
 * Customers always have orgId = membership org. Staff use the orgId encoded in
 * their currently-active route (passed in via the `staffOrgId` arg).
 */
export async function withSessionContext<T>(
  fn: (db: Db, ctx: OrgContext) => Promise<Result<T, AppError>>,
  options?: { staffOrgId?: string },
): Promise<Result<T, AppError>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return err("unauthorized", "Not signed in");
  }
  const ctx = await buildOrgContext(db, {
    userId: session.user.id,
    orgId: options?.staffOrgId,
  });
  if (!ctx) {
    return err("unauthorized", "No organization context — invalid role/membership");
  }
  return fn(db, ctx);
}
