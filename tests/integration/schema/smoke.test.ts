import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { withTransaction, closePool } from "@/tests/fixtures/db";

describe("schema smoke", () => {
  it("has all expected tables", async () => {
    await withTransaction(async (db) => {
      const result = await db.execute<{ table_name: string }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name
      `);
      const names = result.rows.map((r) => r.table_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "accounts", "attachments", "comment_revisions", "comments",
          "daily_update_revisions", "daily_update_tasks", "daily_updates",
          "integrations", "invitations", "members", "notification_deliveries",
          "notification_preferences", "notifications", "organizations",
          "project_assignments", "projects", "sessions", "task_assignments",
          "task_status_log", "tasks", "time_entries", "users", "verifications",
          "work_request_status_log", "work_requests",
        ]),
      );
    });
  });

  it("has the triage queue partial index on tasks", async () => {
    await withTransaction(async (db) => {
      const result = await db.execute<{ indexname: string }>(sql`
        select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'tasks'
      `);
      const names = result.rows.map((r) => r.indexname);
      expect(names).toContain("tasks_triage_idx");
    });
  });

  it("uuidv7() returns a UUID v7", async () => {
    await withTransaction(async (db) => {
      const result = await db.execute<{ id: string }>(sql`select uuidv7() as id`);
      const [first] = result.rows;
      expect(first).toBeDefined();
      const id = first!.id;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  afterAll(async () => {
    await closePool();
  });
});
