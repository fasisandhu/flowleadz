import "server-only";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { ok, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Org = typeof schema.organizations.$inferSelect;

export async function listOrgs(db: AnyDb, ctx: OrgContext): Promise<Result<Org[]>> {
  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;
  const rows = await db.select().from(schema.organizations).orderBy(schema.organizations.name);
  return ok(rows);
}
