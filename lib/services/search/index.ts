import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireOrgAccess } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { searchInputSchema, type SearchInput, type SearchResult } from "./schemas";

export type { SearchInput, SearchResult } from "./schemas";

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

export async function searchAll(
  db: AnyDb,
  ctx: OrgContext,
  input: SearchInput,
): Promise<Result<SearchResult[]>> {
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  if (parsed.data.query.trim() === "") return ok([]);

  const access = await requireOrgAccess(db, ctx);
  if (!access.ok) return access;

  const q = parsed.data.query;
  const orgId = ctx.orgId;
  const limit = parsed.data.limit;

  const taskRows = await (async () => {
    if (ctx.actor.role === "customer") {
      return db.execute(sql`
        SELECT 'task' AS kind, id, title, project_id AS "projectId",
               ts_headline('english',
                 coalesce(title, '') || ' ' || coalesce(description, ''),
                 plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM tasks
        WHERE org_id = ${orgId}
          AND customer_visible = true
          AND project_id IS NOT NULL
          AND search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    if (ctx.actor.role === "employee") {
      return db.execute(sql`
        SELECT 'task' AS kind, t.id, t.title, t.project_id AS "projectId",
               ts_headline('english',
                 coalesce(t.title, '') || ' ' || coalesce(t.description, ''),
                 plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(t.search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM tasks t
        INNER JOIN project_assignments pa ON pa.project_id = t.project_id
        WHERE t.org_id = ${orgId}
          AND pa.user_id = ${ctx.actor.userId}
          AND t.search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    // admin
    return db.execute(sql`
      SELECT 'task' AS kind, id, title, project_id AS "projectId",
             ts_headline('english',
               coalesce(title, '') || ' ' || coalesce(description, ''),
               plainto_tsquery('english', ${q}),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
             ) AS snippet,
             ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
      FROM tasks
      WHERE org_id = ${orgId}
        AND search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
  })();

  const updateRows = await (async () => {
    if (ctx.actor.role === "customer") {
      return db.execute(sql`
        SELECT 'update' AS kind, id, project_id AS "projectId",
               ts_headline('english', coalesce(body, ''), plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM daily_updates
        WHERE org_id = ${orgId}
          AND visibility = 'customer_visible'
          AND search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    if (ctx.actor.role === "employee") {
      return db.execute(sql`
        SELECT 'update' AS kind, d.id, d.project_id AS "projectId",
               ts_headline('english', coalesce(d.body, ''), plainto_tsquery('english', ${q}),
                 'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
               ) AS snippet,
               ts_rank(d.search_vector, plainto_tsquery('english', ${q})) AS rank
        FROM daily_updates d
        INNER JOIN project_assignments pa ON pa.project_id = d.project_id
        WHERE d.org_id = ${orgId}
          AND pa.user_id = ${ctx.actor.userId}
          AND d.search_vector @@ plainto_tsquery('english', ${q})
        ORDER BY rank DESC
        LIMIT ${limit}
      `);
    }
    // admin
    return db.execute(sql`
      SELECT 'update' AS kind, id, project_id AS "projectId",
             ts_headline('english', coalesce(body, ''), plainto_tsquery('english', ${q}),
               'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
             ) AS snippet,
             ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
      FROM daily_updates
      WHERE org_id = ${orgId}
        AND search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
  })();

  const workRequestRows = await db.execute(sql`
    SELECT 'work_request' AS kind, id, title,
           ts_headline('english',
             coalesce(title, '') || ' ' || coalesce(description, ''),
             plainto_tsquery('english', ${q}),
             'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MinWords=4, MaxWords=18'
           ) AS snippet,
           ts_rank(search_vector, plainto_tsquery('english', ${q})) AS rank
    FROM work_requests
    WHERE org_id = ${orgId}
      AND search_vector @@ plainto_tsquery('english', ${q})
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  const results: SearchResult[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of taskRows.rows as any[]) {
    results.push({
      kind: "task",
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      rank: Number(r.rank),
      projectId: r.projectId ?? null,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of updateRows.rows as any[]) {
    results.push({
      kind: "update",
      id: r.id,
      snippet: r.snippet,
      rank: Number(r.rank),
      projectId: r.projectId,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of workRequestRows.rows as any[]) {
    results.push({
      kind: "work_request",
      id: r.id,
      title: r.title,
      snippet: r.snippet,
      rank: Number(r.rank),
    });
  }

  results.sort((a, b) => b.rank - a.rank);
  return ok(results.slice(0, limit));
}
