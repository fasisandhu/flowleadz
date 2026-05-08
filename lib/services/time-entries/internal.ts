import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function resolveRate(
  db: AnyDb,
  projectId: string,
  userId: string,
): Promise<number | null> {
  const [project] = await db
    .select({ rate: schema.projects.hourlyRateCents })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (project?.rate != null) return project.rate;

  const [user] = await db
    .select({ rate: schema.users.defaultHourlyRateCents })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return user?.rate ?? null;
}
