/**
 * Additive demo-data seed for FlowLeadz.
 *
 * Assumes `scripts/dev-seed.ts` (or the equivalent) has already created the
 * three baseline users (admin/employee/customer @e2e.test) and the `Acme E2E`
 * org. This script layers realistic multi-user, multi-project content on top
 * so screenshots and demos are not visibly empty.
 *
 * Idempotency: additional users use @flowleadz.demo emails and each insert
 * uses ON CONFLICT DO NOTHING so re-running only backfills what's missing —
 * but tasks/projects/etc. get freshly created each run, so avoid re-running
 * against the same DB unless you first wipe.
 */
import { Pool } from "pg";
import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}

const pool = new Pool({ connectionString });

async function q(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

const PASSWORD = "Passw0rd!Test123";

const EXTRA_EMPLOYEES = [
  { email: "sara.mitchell@flowleadz.demo", name: "Sara Mitchell" },
  { email: "james.okoro@flowleadz.demo", name: "James Okoro" },
  { email: "priya.raman@flowleadz.demo", name: "Priya Raman" },
];

const EXTRA_CUSTOMERS = [
  { email: "olivia.chen@flowleadz.demo", name: "Olivia Chen" },
  { email: "marcus.hale@flowleadz.demo", name: "Marcus Hale" },
];

const REAL_NAMES = {
  "admin@e2e.test": "Faseeh Ahmed",
  "employee@e2e.test": "Daniel Rivera",
  "customer@e2e.test": "Emma Whitfield",
};

async function main() {
  console.log("→ Loading baseline...");

  const orgRow = await q(
    "SELECT id FROM organizations WHERE slug = 'acme-e2e' LIMIT 1",
  );
  if (!orgRow.rows.length) {
    throw new Error("Baseline org 'acme-e2e' not found. Run dev-seed first.");
  }
  const orgId = orgRow.rows[0].id as string;

  await q("UPDATE organizations SET name = 'Acme Corporation' WHERE id = $1", [
    orgId,
  ]);

  for (const [email, name] of Object.entries(REAL_NAMES)) {
    await q("UPDATE users SET name = $1 WHERE email = $2", [name, email]);
  }

  const idFor = async (email: string) => {
    const r = await q("SELECT id FROM users WHERE email = $1", [email]);
    return (r.rows[0] as { id: string } | undefined)?.id;
  };

  const adminId = (await idFor("admin@e2e.test"))!;
  const primaryEmployeeId = (await idFor("employee@e2e.test"))!;
  const primaryCustomerId = (await idFor("customer@e2e.test"))!;

  console.log("→ Adding extra users...");
  const pw = await hashPassword(PASSWORD);
  const addUser = async (
    email: string,
    name: string,
    role: "employee" | "customer",
  ) => {
    const existing = await q("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) return existing.rows[0].id as string;
    const userId = generateId();
    const accountId = generateId();
    const now = new Date();
    await q(
      `INSERT INTO users (id, name, email, email_verified, system_role, created_at, updated_at)
       VALUES ($1, $2, $3, true, $4, $5, $5)`,
      [userId, name, email, role, now],
    );
    await q(
      `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
       VALUES ($1, $2, $3, 'credential', $4, $5, $5)`,
      [accountId, userId, userId, pw, now],
    );
    return userId;
  };

  const employeeIds: string[] = [primaryEmployeeId];
  for (const u of EXTRA_EMPLOYEES) {
    employeeIds.push(await addUser(u.email, u.name, "employee"));
  }
  const customerIds: string[] = [primaryCustomerId];
  for (const u of EXTRA_CUSTOMERS) {
    const id = await addUser(u.email, u.name, "customer");
    customerIds.push(id);
    await q(
      `INSERT INTO members (id, user_id, organization_id, role, created_at)
       VALUES ($1, $2, $3, 'member', now())
       ON CONFLICT (user_id, organization_id) DO NOTHING`,
      [generateId(), id, orgId],
    );
  }

  console.log("→ Adding projects...");
  const projects = [
    {
      name: "Acme SEO Q3 Rollout",
      description:
        "Search visibility program covering technical audit, content refresh, and link acquisition.",
      status: "active",
      service_type: "seo",
      rate: 12000,
    },
    {
      name: "Product Launch Paid Campaign",
      description:
        "Multi-platform paid launch — Meta, Google, LinkedIn — targeting the fall product line.",
      status: "active",
      service_type: "paid_ads",
      rate: 14500,
    },
    {
      name: "Social Refresh — Instagram & TikTok",
      description: "Rebranded feed rollout, weekly content, and creator seeding.",
      status: "active",
      service_type: "social",
      rate: 9500,
    },
    {
      name: "Editorial Content Hub",
      description:
        "12-article thought-leadership series on RevOps automation, gated with lead magnets.",
      status: "active",
      service_type: "content",
      rate: 11000,
    },
    {
      name: "Marketing Site Redesign",
      description:
        "Full refresh of acme.com — new IA, updated brand system, and Next.js migration.",
      status: "paused",
      service_type: "web",
      rate: 15000,
    },
    {
      name: "Legacy Blog Migration",
      description: "Migrated 240 posts from WordPress to Ghost. Redirects verified.",
      status: "completed",
      service_type: "content",
      rate: 10000,
    },
  ];

  const projectIds: string[] = [];
  for (const p of projects) {
    const r = await q(
      `INSERT INTO projects (org_id, name, description, status, service_type, hourly_rate_cents, created_by, start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() - interval '${Math.floor(
         Math.random() * 60 + 10,
       )} days')
       RETURNING id`,
      [orgId, p.name, p.description, p.status, p.service_type, p.rate, adminId],
    );
    projectIds.push(r.rows[0].id as string);
  }

  console.log("→ Assigning employees to projects...");
  for (let i = 0; i < projectIds.length; i++) {
    // rotate: each project gets 2 employees
    const a = employeeIds[i % employeeIds.length];
    const b = employeeIds[(i + 1) % employeeIds.length];
    for (const empId of new Set([a, b])) {
      await q(
        `INSERT INTO project_assignments (user_id, project_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [empId, projectIds[i]],
      );
    }
  }

  console.log("→ Creating tasks...");
  type TaskSpec = {
    project: number;
    title: string;
    status: "todo" | "in_progress" | "blocked" | "done";
    priority: "low" | "normal" | "high" | "urgent";
    dueOffsetDays: number;
    assignee?: number;
    description?: string;
  };
  const taskSpecs: TaskSpec[] = [
    { project: 0, title: "Technical SEO audit — crawl + Lighthouse", status: "done", priority: "high", dueOffsetDays: -14, assignee: 0 },
    { project: 0, title: "Fix duplicate meta descriptions on product pages", status: "in_progress", priority: "high", dueOffsetDays: 2, assignee: 1 },
    { project: 0, title: "Publish pillar page: 'Growth Loops in B2B SaaS'", status: "todo", priority: "normal", dueOffsetDays: 9, assignee: 2 },
    { project: 0, title: "Outreach — 30 backlinks from tier-1 domains", status: "todo", priority: "normal", dueOffsetDays: 21, assignee: 3 },
    { project: 1, title: "Creative brief — fall launch static + motion", status: "done", priority: "high", dueOffsetDays: -7, assignee: 0 },
    { project: 1, title: "Meta Ads structure v2 — ASC + interest split", status: "in_progress", priority: "urgent", dueOffsetDays: 1, assignee: 0 },
    { project: 1, title: "LinkedIn CAPI event mapping", status: "blocked", priority: "high", dueOffsetDays: 5, assignee: 1, description: "Waiting on data eng to expose signup event via warehouse sync." },
    { project: 1, title: "Weekly campaign report — WoW MER + creative fatigue", status: "todo", priority: "normal", dueOffsetDays: 4 },
    { project: 2, title: "Content calendar — August + September", status: "done", priority: "normal", dueOffsetDays: -5, assignee: 2 },
    { project: 2, title: "Reels shoot — office culture (3 concepts)", status: "in_progress", priority: "normal", dueOffsetDays: 6, assignee: 2 },
    { project: 2, title: "TikTok creator seeding — outreach batch #3", status: "todo", priority: "low", dueOffsetDays: 14, assignee: 3 },
    { project: 3, title: "Outline article #4 — 'RevOps for late-stage startups'", status: "done", priority: "normal", dueOffsetDays: -3, assignee: 3 },
    { project: 3, title: "Draft article #5 — Automation ROI framework", status: "in_progress", priority: "normal", dueOffsetDays: 3, assignee: 3 },
    { project: 3, title: "Design lead magnet — RevOps Maturity Assessment", status: "todo", priority: "high", dueOffsetDays: 10, assignee: 1 },
    { project: 4, title: "Wireframes v3 — home + pricing + about", status: "blocked", priority: "high", dueOffsetDays: 12, description: "Blocked pending exec sign-off on new IA." },
    { project: 4, title: "Migrate marketing site to Next.js 15", status: "todo", priority: "normal", dueOffsetDays: 30, assignee: 0 },
  ];

  const taskIds: string[] = [];
  for (const t of taskSpecs) {
    const r = await q(
      `INSERT INTO tasks (org_id, project_id, title, description, status, priority, due_date, customer_visible, source, created_by, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, current_date + $7::int, true, 'admin_created', $8, $9)
       RETURNING id`,
      [
        orgId,
        projectIds[t.project],
        t.title,
        t.description ?? null,
        t.status,
        t.priority,
        t.dueOffsetDays,
        adminId,
        t.status === "done" ? new Date() : null,
      ],
    );
    const taskId = r.rows[0].id as string;
    taskIds.push(taskId);
    if (t.assignee !== undefined) {
      await q(
        `INSERT INTO task_assignments (task_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [taskId, employeeIds[t.assignee]],
      );
    }
  }

  console.log("→ Logging time entries...");
  const timeEntries: Array<{
    projectIdx: number;
    taskIdx: number;
    assignee: number;
    minutes: number;
    daysAgo: number;
    note?: string;
  }> = [
    { projectIdx: 0, taskIdx: 0, assignee: 0, minutes: 240, daysAgo: 14, note: "Audit + Lighthouse pass 1" },
    { projectIdx: 0, taskIdx: 1, assignee: 1, minutes: 90, daysAgo: 3, note: "Product pages template patch" },
    { projectIdx: 0, taskIdx: 1, assignee: 1, minutes: 75, daysAgo: 1 },
    { projectIdx: 1, taskIdx: 4, assignee: 0, minutes: 180, daysAgo: 7, note: "Creative brief + first review" },
    { projectIdx: 1, taskIdx: 5, assignee: 0, minutes: 150, daysAgo: 2 },
    { projectIdx: 2, taskIdx: 8, assignee: 2, minutes: 120, daysAgo: 5 },
    { projectIdx: 2, taskIdx: 9, assignee: 2, minutes: 90, daysAgo: 1, note: "Concept storyboards" },
    { projectIdx: 3, taskIdx: 11, assignee: 3, minutes: 200, daysAgo: 3 },
    { projectIdx: 3, taskIdx: 12, assignee: 3, minutes: 145, daysAgo: 1 },
  ];
  for (const t of timeEntries) {
    await q(
      `INSERT INTO time_entries (org_id, project_id, task_id, user_id, minutes, logged_for_date, note)
       VALUES ($1, $2, $3, $4, $5, current_date - $6::int, $7)`,
      [
        orgId,
        projectIds[t.projectIdx],
        taskIds[t.taskIdx],
        employeeIds[t.assignee],
        t.minutes,
        t.daysAgo,
        t.note ?? null,
      ],
    );
  }

  console.log("→ Writing daily updates...");
  type UpdateSpec = {
    projectIdx: number;
    userIdx: number;
    activity: "planning" | "execution" | "review" | "meeting" | "admin" | "other";
    visibility: "customer_visible" | "internal_only";
    body: string;
    daysAgo: number;
  };
  const updates: UpdateSpec[] = [
    {
      projectIdx: 0, userIdx: 0, activity: "execution", visibility: "customer_visible", daysAgo: 3,
      body: "Wrapped the initial technical audit. 47 issues surfaced, 12 marked high-priority; fixes staged for this sprint. Full report in Docs.",
    },
    {
      projectIdx: 0, userIdx: 1, activity: "execution", visibility: "customer_visible", daysAgo: 1,
      body: "Deployed meta description fixes across 214 product pages. Indexing looks good, monitoring GSC for CTR lift over the next 10 days.",
    },
    {
      projectIdx: 1, userIdx: 0, activity: "execution", visibility: "customer_visible", daysAgo: 2,
      body: "Meta Ads restructure live. ASC campaigns holding CPA at $32; interest set still testing. Will hold judgment 5–7 days.",
    },
    {
      projectIdx: 1, userIdx: 1, activity: "review", visibility: "internal_only", daysAgo: 4,
      body: "LinkedIn CAPI is stuck — data team hasn't shipped the warehouse sync. Flagged to Priya, may need to escalate.",
    },
    {
      projectIdx: 2, userIdx: 2, activity: "planning", visibility: "customer_visible", daysAgo: 5,
      body: "Locked the August/September calendar — 24 posts across IG + TikTok. Skewing toward BTS + product education, less pure product shots.",
    },
    {
      projectIdx: 3, userIdx: 3, activity: "execution", visibility: "customer_visible", daysAgo: 1,
      body: "Article #5 draft is at 2,200 words. Peer review Wednesday, publish target Friday.",
    },
    {
      projectIdx: 3, userIdx: 3, activity: "meeting", visibility: "internal_only", daysAgo: 6,
      body: "Editorial sync — agreed to swap article #7 topic to 'Attribution debt.' James will draft the outline.",
    },
  ];
  for (const u of updates) {
    await q(
      `INSERT INTO daily_updates (org_id, project_id, user_id, body, activity_type, visibility, log_date)
       VALUES ($1, $2, $3, $4, $5, $6, current_date - $7::int)`,
      [
        orgId,
        projectIds[u.projectIdx],
        employeeIds[u.userIdx],
        u.body,
        u.activity,
        u.visibility,
        u.daysAgo,
      ],
    );
  }

  console.log("→ Adding work requests...");
  type WRSpec = {
    projectIdx: number | null;
    submitter: number;
    title: string;
    description: string;
    status: "submitted" | "accepted" | "rejected" | "duplicate";
    priorityHint: "low" | "normal" | "high" | "urgent";
    rejectionReason?: string;
    daysAgo: number;
  };
  const requests: WRSpec[] = [
    {
      projectIdx: 0, submitter: 0, status: "submitted", priorityHint: "high", daysAgo: 1,
      title: "Add schema markup to case study pages",
      description: "We noticed the case study pages aren't getting rich snippets. Can we add Article + Organization schema?",
    },
    {
      projectIdx: 1, submitter: 0, status: "submitted", priorityHint: "urgent", daysAgo: 0,
      title: "Pause LinkedIn spend for a week",
      description: "Board asked us to hold LinkedIn budget until the exec sync on Friday. Can we pause the active campaigns and resume Monday?",
    },
    {
      projectIdx: 2, submitter: 1, status: "accepted", priorityHint: "normal", daysAgo: 5,
      title: "Instagram Story series — customer wins",
      description: "5-part story series highlighting recent customer wins. We'll provide the raw quotes and imagery.",
    },
    {
      projectIdx: null, submitter: 2, status: "rejected", priorityHint: "low", daysAgo: 8,
      title: "Add TikTok Shop integration",
      description: "Can we set up TikTok Shop for the fall products?",
      rejectionReason: "Out of scope for the current retainer. Happy to quote separately — reply here to kick that off.",
    },
    {
      projectIdx: 3, submitter: 0, status: "accepted", priorityHint: "high", daysAgo: 11,
      title: "Expand editorial to 20 articles (from 12)",
      description: "Executive team wants to double down on content. Additional 8 articles by end of quarter.",
    },
  ];
  for (const w of requests) {
    await q(
      `INSERT INTO work_requests (org_id, project_id, submitted_by, title, description, status, priority_hint, rejection_reason, reviewed_by, reviewed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() - $11::int * interval '1 day')`,
      [
        orgId,
        w.projectIdx !== null ? projectIds[w.projectIdx] : null,
        customerIds[w.submitter],
        w.title,
        w.description,
        w.status,
        w.priorityHint,
        w.rejectionReason ?? null,
        w.status === "accepted" || w.status === "rejected" ? adminId : null,
        w.status === "accepted" || w.status === "rejected"
          ? new Date(Date.now() - Math.max(0, w.daysAgo - 1) * 86400_000)
          : null,
        w.daysAgo,
      ],
    );
  }

  console.log("→ Sprinkling comments...");
  const dailyUpdateRows = await q(
    `SELECT id FROM daily_updates WHERE org_id = $1 ORDER BY log_date DESC LIMIT 3`,
    [orgId],
  );
  const commenters = [adminId, primaryCustomerId];
  const bodies = [
    "Nice progress — the CTR numbers on the fixed pages already look encouraging in GSC.",
    "Can we hop on a quick call Thursday to walk through the audit findings?",
    "Great, thanks for staying on top of this.",
  ];
  for (let i = 0; i < dailyUpdateRows.rows.length; i++) {
    const upd = dailyUpdateRows.rows[i] as { id: string };
    await q(
      `INSERT INTO comments (parent_type, parent_id, user_id, body) VALUES ('daily_update', $1, $2, $3)`,
      [upd.id, commenters[i % commenters.length], bodies[i % bodies.length]],
    );
  }

  console.log("\nDemo data seeded successfully.");
  console.log(`  Org:           Acme Corporation (id=${orgId})`);
  console.log(`  Employees:     ${employeeIds.length}`);
  console.log(`  Customers:     ${customerIds.length}`);
  console.log(`  Projects:      ${projectIds.length}`);
  console.log(`  Tasks:         ${taskIds.length}`);
  console.log(`  Time entries:  ${timeEntries.length}`);
  console.log(`  Updates:       ${updates.length}`);
  console.log(`  Work requests: ${requests.length}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
