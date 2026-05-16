import "server-only";
import { auth } from "@/lib/better-auth/config";
import { db } from "@/lib/db/client";
import { buildOrgContext } from "./build-context";

export async function resolveSessionContext(
  reqHeaders: Headers,
): Promise<{ userId: string; orgId: string } | null> {
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session?.user) return null;
  const ctx = await buildOrgContext(db, { userId: session.user.id });
  if (!ctx) return null;
  return { userId: ctx.actor.userId, orgId: ctx.orgId };
}
