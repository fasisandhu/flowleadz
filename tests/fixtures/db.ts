import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "@/lib/db/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5433/crm" });

export type TestDb = ReturnType<typeof drizzle<typeof schema>> & { _client: PoolClient };

export async function withTransaction<T>(fn: (db: TestDb) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  await client.query("BEGIN");
  try {
    const base = drizzle({ client, schema, casing: "snake_case" });
    const db = base as unknown as TestDb;
    db._client = client;
    const result = await fn(db);
    await client.query("ROLLBACK");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
