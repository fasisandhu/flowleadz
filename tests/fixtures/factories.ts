import type { TestDb } from "./db";
import * as schema from "@/lib/db/schema";

let counter = 0;
const uniq = () => `${Date.now()}-${++counter}`;

export async function createOrg(db: TestDb, overrides: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const id = `org_${uniq()}`;
  const [row] = await db
    .insert(schema.organizations)
    .values({ id, name: `Org ${id}`, slug: `org-${id}`, ...overrides })
    .returning();
  return row!;
}

export async function createUser(
  db: TestDb,
  overrides: Partial<typeof schema.users.$inferInsert> & { role?: "customer" | "employee" | "admin" } = {},
) {
  const id = `usr_${uniq()}`;
  const role = overrides.role ?? "customer";
  const { role: _r, ...rest } = overrides;
  const [row] = await db
    .insert(schema.users)
    .values({
      id,
      email: `${id}@example.test`,
      name: `User ${id}`,
      systemRole: role,
      ...rest,
    })
    .returning();
  return row!;
}

export async function createMembership(db: TestDb, userId: string, orgId: string) {
  const id = `mbr_${uniq()}`;
  const [row] = await db
    .insert(schema.members)
    .values({ id, userId, organizationId: orgId, role: "member" })
    .returning();
  return row!;
}

export async function createProject(
  db: TestDb,
  orgId: string,
  createdBy: string,
  overrides: Partial<typeof schema.projects.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.projects)
    .values({
      orgId,
      createdBy,
      name: `Project ${uniq()}`,
      serviceType: "seo",
      status: "active",
      ...overrides,
    })
    .returning();
  return row!;
}

export async function assignProject(db: TestDb, userId: string, projectId: string) {
  await db.insert(schema.projectAssignments).values({ userId, projectId });
}
