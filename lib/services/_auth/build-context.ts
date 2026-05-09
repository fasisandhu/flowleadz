import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import type { OrgContext } from "@/lib/services/_context";

// AnyDb accepts any PG-dialect Drizzle instance: NeonHttpDatabase (production),
// NodePgDatabase (tests), etc. — they all extend PgDatabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function buildOrgContext(
  db: AnyDb,
  input: { userId: string; orgId?: string },
): Promise<OrgContext | null> {
  const [user] = await db
    .select({ id: schema.users.id, role: schema.users.systemRole })
    .from(schema.users)
    .where(eq(schema.users.id, input.userId))
    .limit(1);
  if (!user) return null;

  if (user.role === "customer") {
    const [member] = await db
      .select({ orgId: schema.members.organizationId })
      .from(schema.members)
      .where(eq(schema.members.userId, user.id))
      .limit(1);
    if (!member) return null;
    return {
      kind: "org",
      orgId: member.orgId,
      actor: { userId: user.id, role: "customer", membershipOrgId: member.orgId },
    };
  }

  // staff (employee or admin)
  // If no explicit orgId was provided, derive it from the user's project assignments
  // (employees are not in the `members` table, so we fall back to their projects' org).
  if (!input.orgId) {
    if (user.role === "employee") {
      const [assigned] = await db
        .select({ orgId: schema.projects.orgId })
        .from(schema.projectAssignments)
        .innerJoin(schema.projects, eq(schema.projectAssignments.projectId, schema.projects.id))
        .where(eq(schema.projectAssignments.userId, user.id))
        .limit(1);
      if (!assigned) return null;
      return {
        kind: "org",
        orgId: assigned.orgId,
        actor: { userId: user.id, role: user.role, membershipOrgId: null },
      };
    }
    return null;
  }
  return {
    kind: "org",
    orgId: input.orgId,
    actor: { userId: user.id, role: user.role, membershipOrgId: null },
  };
}
