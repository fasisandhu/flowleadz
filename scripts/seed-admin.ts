/**
 * One-time admin bootstrap.
 *
 * Use this exactly once on a fresh production database to create the first
 * admin user. Every subsequent account (employees, customers, additional
 * admins) is created via the in-app Invite User flow.
 *
 * Usage:
 *   DATABASE_URL=<prod connection string> \
 *   ADMIN_EMAIL=you@example.com \
 *   ADMIN_PASSWORD=<at least 12 chars> \
 *   ADMIN_NAME="Your Name" \
 *   pnpm db:seed:admin
 *
 * The script refuses to run if any admin user already exists, so it's safe
 * to invoke by accident.
 */
import { Pool } from "pg";
import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrator";

  if (!email || !password) {
    console.error(
      "Missing ADMIN_EMAIL or ADMIN_PASSWORD env vars. See header of scripts/seed-admin.ts.",
    );
    process.exit(2);
  }
  if (password.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(2);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const existing = await pool.query(
      `SELECT id, email FROM users WHERE system_role = 'admin' LIMIT 1`,
    );
    if (existing.rowCount && existing.rowCount > 0) {
      const row = existing.rows[0] as { id: string; email: string };
      console.error(
        `Refusing to seed: an admin already exists (${row.email}). Use the in-app Invite User flow to create more admins.`,
      );
      process.exit(1);
    }

    const userId = `usr_admin_${generateId()}`;
    const accountId = `acc_${userId}`;
    const passwordHash = await hashPassword(password);
    const now = new Date();

    await pool.query("BEGIN");
    try {
      await pool.query(
        `INSERT INTO users (id, name, email, email_verified, system_role, created_at, updated_at)
         VALUES ($1, $2, $3, true, 'admin', $4, $4)`,
        [userId, name, email, now],
      );
      await pool.query(
        `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
         VALUES ($1, $2, $3, 'credential', $4, $5, $5)`,
        [accountId, userId, userId, passwordHash, now],
      );
      await pool.query("COMMIT");
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }

    console.log("Admin created:");
    console.log(`  Email: ${email}`);
    console.log(`  Name:  ${name}`);
    console.log(`  ID:    ${userId}`);
    console.log("\nSign in at /login. Then use the dashboard's Invite User button to add more accounts.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
