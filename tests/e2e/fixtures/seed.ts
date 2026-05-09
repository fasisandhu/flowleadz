/**
 * E2E seed helper — Option B (Better Auth crypto hasher).
 *
 * The main app DB client uses @neondatabase/serverless (HTTP transport) which
 * does not work against a local Postgres instance. This module uses the `pg`
 * package (node-postgres) directly for all seed operations.
 *
 * Password hashing uses `better-auth/crypto`'s `hashPassword` so the hash
 * format is identical to what Better Auth's sign-in verification expects.
 */
import { Pool } from "pg";
import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? "postgres://crm:crm@localhost:5433/crm",
    });
  }
  return pool;
}

async function exec(sql: string, params: unknown[] = []) {
  const c = await getPool().connect();
  try {
    return await c.query(sql, params);
  } finally {
    c.release();
  }
}

const TEST_PASSWORD = "Passw0rd!Test123";

const TEST_USERS = [
  { email: "admin@e2e.test", name: "Admin E2E", role: "admin" as const },
  { email: "employee@e2e.test", name: "Employee E2E", role: "employee" as const },
  { email: "customer@e2e.test", name: "Customer E2E", role: "customer" as const },
] as const;

export async function seedTestUsers() {
  // Wipe previous test data in dependency order so FK constraints are satisfied.
  // 0. Delete time entries first (FK → tasks, no cascade).
  await exec(
    `DELETE FROM time_entries WHERE project_id IN (
       SELECT id FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')
     )`,
  );
  await exec(
    `DELETE FROM project_assignments WHERE project_id IN (
       SELECT id FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')
     )`,
  );
  // 1. Remove tasks created by e2e users first — tasks.source_request_id has ON DELETE SET NULL
  //    which would violate tasks_source_consistency check when work_requests are deleted.
  //    Deleting tasks first cascades task_status_log, task_assignments.
  await exec(
    "DELETE FROM tasks WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')",
  );
  await exec(
    `DELETE FROM tasks WHERE project_id IN (
       SELECT id FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')
     )`,
  );
  // 2. Remove work_requests before projects (FK: work_requests.project_id → projects.id).
  await exec(
    "DELETE FROM work_requests WHERE submitted_by IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')",
  );
  await exec(
    `DELETE FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')`,
  );
  // 3. Now safe to delete users (cascades accounts/sessions/members).
  await exec("DELETE FROM users WHERE email LIKE '%@e2e.test'");
  await exec("DELETE FROM organizations WHERE slug = 'acme-e2e'");

  const pwHash = await hashPassword(TEST_PASSWORD);

  for (const u of TEST_USERS) {
    const userId = generateId();
    const accountId = generateId();
    const now = new Date();

    await exec(
      `INSERT INTO users (id, name, email, email_verified, system_role, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, $5)`,
      [userId, u.name, u.email, u.role, now],
    );

    await exec(
      `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
       VALUES ($1, $2, $3, 'credential', $4, $5, $5)`,
      [accountId, userId, userId, pwHash, now],
    );
  }

  // Create a customer org + membership.
  const orgId = "org_acme_e2e";
  const memberId = "mbr_customer_e2e";
  await exec(
    `INSERT INTO organizations (id, name, slug, created_at) VALUES ($1, $2, $3, $4)`,
    [orgId, "Acme E2E", "acme-e2e", new Date()],
  );
  const customerRow = await exec(
    "SELECT id FROM users WHERE email = 'customer@e2e.test'",
  );
  const customerId = (customerRow.rows[0] as { id: string }).id;
  await exec(
    `INSERT INTO members (id, user_id, organization_id, role, created_at)
     VALUES ($1, $2, $3, 'member', $4)`,
    [memberId, customerId, orgId, new Date()],
  );

  // Create a project owned by admin in the e2e org, assign the employee, and add a task.
  const adminRow = await exec("SELECT id FROM users WHERE email = 'admin@e2e.test'");
  const employeeRow = await exec("SELECT id FROM users WHERE email = 'employee@e2e.test'");
  const adminId = (adminRow.rows[0] as { id: string }).id;
  const employeeId = (employeeRow.rows[0] as { id: string }).id;

  // Insert the project (UUID v7 from the DB).
  const projectRes = await exec(
    `INSERT INTO projects (org_id, name, description, status, service_type, created_by)
     VALUES ($1, 'E2E project', 'Used by Playwright tests', 'active', 'seo', $2)
     RETURNING id`,
    [orgId, adminId],
  );
  const projectId = (projectRes.rows[0] as { id: string }).id;

  // Assign employee to the project.
  await exec(
    `INSERT INTO project_assignments (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [employeeId, projectId],
  );

  // Create a task.
  const taskRes = await exec(
    `INSERT INTO tasks (org_id, project_id, title, source, created_by)
     VALUES ($1, $2, 'E2E task', 'admin_created', $3)
     RETURNING id`,
    [orgId, projectId, adminId],
  );
  const taskId = (taskRes.rows[0] as { id: string }).id;

  // Customer-submitted work request, in 'submitted' state.
  // project_id is included so the admin can accept without selecting a project.
  const customerRow2 = await exec("SELECT id FROM users WHERE email = 'customer@e2e.test'");
  const customerId2 = (customerRow2.rows[0] as { id: string }).id;
  const requestRes = await exec(
    `INSERT INTO work_requests (org_id, project_id, title, description, status, submitted_by)
     VALUES ($1, $2, 'E2E request to accept', 'Please make this thing happen', 'submitted', $3)
     RETURNING id`,
    [orgId, projectId, customerId2],
  );
  const workRequestId = (requestRes.rows[0] as { id: string }).id;

  return { password: TEST_PASSWORD, projectId, taskId, workRequestId };
}

/**
 * Tear down all e2e-created rows so subsequent vitest runs don't see them
 * in `SELECT *` queries. Cascades from users handle notifications + deliveries.
 */
export async function cleanupTestData() {
  // Delete time entries before tasks to avoid FK violation on time_entries.task_id.
  await exec(
    `DELETE FROM time_entries WHERE project_id IN (
       SELECT id FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')
     )`,
  );
  // project_assignments.user_id ON DELETE CASCADE handles cleanup of the employee
  // assignment when users are deleted; for safety also explicit-delete via the org.
  await exec(
    `DELETE FROM project_assignments WHERE project_id IN (
       SELECT id FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')
     )`,
  );
  await exec(
    `DELETE FROM tasks WHERE created_by IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')`,
  );
  await exec(
    `DELETE FROM tasks WHERE project_id IN (
       SELECT id FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')
     )`,
  );
  // Delete work_requests before projects (FK: work_requests.project_id → projects.id).
  await exec(
    `DELETE FROM work_requests WHERE submitted_by IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')`,
  );
  await exec(
    `DELETE FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')`,
  );
  await exec(`DELETE FROM users WHERE email LIKE '%@e2e.test'`);
  await exec(`DELETE FROM organizations WHERE slug = 'acme-e2e'`);
}

export async function closeSeedPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
