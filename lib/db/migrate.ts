import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/lib/env";

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle({ client: pool });

await migrate(db, { migrationsFolder: "./lib/db/migrations" });
await pool.end();
console.log("Migrations applied.");
