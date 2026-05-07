# Marketing CRM — Phase 1 Design

| Field         | Value                                                    |
| ------------- | -------------------------------------------------------- |
| Status        | Approved (brainstorm phase)                              |
| Date          | 2026-05-08                                               |
| Owner         | m.faseeh@valutico.com                                    |
| Stage         | Phase 1                                                  |
| Implements    | Internal CRM dashboard for a marketing agency            |
| Spec location | `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md` |

---

## 1. Context

A marketing agency needs a single web app where:

- **Customers** (the agency's clients) see daily progress against their projects, browse upcoming tasks, comment on updates, and submit new work requests.
- **Employees** (agency staff) log daily updates, track time against tasks, and manage assigned work.
- **Admins** manage organizations, users, projects, triage incoming work requests, and assign tasks.

The system must be multi-tenant by data design from day one even though the agency launches with one client. Phase 2 will add HubSpot, Meta Ads, Instagram Business, and LinkedIn integrations — Phase 1 must architect for them without building them.

## 2. Phase 1 scope

In:

1. Authentication with role-based access (`customer` / `employee` / `admin`)
2. Customer dashboard: active projects, daily updates feed, upcoming tasks, work request form
3. Employee views: log daily updates, mark tasks complete, see assigned work, log time
4. Admin views: manage orgs/users/projects, assign tasks, route work requests
5. In-app + email notifications for new updates, comments, request status changes, task assignments and status flips
6. File attachments on daily updates, work requests, tasks, and comments
7. Comments on daily updates (flat, with edit history)
8. Edit history for daily updates and comments; lightweight status logs for tasks and work requests
9. Time tracking against tasks with snapshotted hourly rates

Out:

- HubSpot, Meta Ads, Instagram Business, LinkedIn integrations (table stub only — see §15)
- Mobile app, white-label branding
- Threaded comments
- Comments on work requests or tasks (only on daily updates in Phase 1)
- Per-customer-user project ACL (customers in an org see all of that org's projects)
- Per-task-assignee role (e.g., "lead" vs "watcher")
- Time-entry approval workflow
- Exports / billing reports beyond raw query
- Real-time push (polling 30s instead)
- SAML / SSO / MFA / passkeys (architected for via Better Auth plugin model)

## 3. Tech stack

- **Next.js 15** (App Router, TypeScript, Server Actions)
- **Neon** Postgres (serverless, no auto-pause)
- **Drizzle ORM** + Drizzle Kit for migrations
- **Better Auth** (email + password, magic link, Google OAuth)
- **Cloudflare R2** for object storage
- **Resend** for transactional email + **React Email** for templates
- **Tailwind CSS** + **shadcn/ui** + **lucide-react**
- **Zod** for validation, **drizzle-zod** for schema-derived shapes
- **Vitest** + **React Testing Library** + **Playwright** for tests
- **Pino** for structured logging
- **Vercel** for deploy

## 4. Architecture overview

A Next.js 15 monolith on Vercel, fronted by App Router, talking to Neon Postgres via Drizzle. Three concentric layers:

1. **Routing layer** — Next.js routes + Server Actions in role-scoped route groups: `(customer)`, `(employee)`, `(admin)`, `(auth)`. Routes never import `@/lib/db/client` directly.
2. **Service layer** (`lib/services/*`) — all business logic, all DB access, all authorization, all org-scoping. Pure async functions taking `OrgContext` as their first argument. This is where multi-tenant safety lives.
3. **Adapter layer** — `lib/db`, `lib/better-auth`, `lib/storage`, `lib/email`, `lib/notifications` — thin wrappers around Drizzle, Better Auth, R2, Resend, and the in-app delivery mechanism.

Key invariants:

- The only modules that may import `@/lib/db/client` are files under `@/lib/services/**` and `@/lib/db/**`. Enforced by `eslint-plugin-no-restricted-imports`.
- Every public service function takes `OrgContext` as its first parameter and calls `requireOrgAccess(ctx)` before any DB access.
- Every domain query filters on `org_id = ctx.orgId`. Schema makes this fail-loud — `org_id` is non-null on all domain tables.
- Server Actions return `Result<T, AppError>`. No exceptions cross the wire.
- Background work (email send, deferred notification fan-out) uses Next.js 15 `unstable_after()`. Service layer wraps it as `dispatch.afterResponse(fn)` so a queue can be swapped in later without changing call sites.

## 5. Tenancy & authorization model

**Tenancy shape: agency staff are global; customers belong to client orgs.**

- Every customer organization is a row in Better Auth's `organizations` table.
- Customer users have a `members` row tying them to their client org.
- Staff users (admin / employee) have NO `members` row. They are global users distinguished by `users.system_role`.
- Every domain table carries `org_id = client_org_id` on every row.
- Cross-org access for staff resolves through `project_assignments(user_id, project_id) → project.org_id`.

**Roles** are stored as `users.system_role enum('customer','employee','admin')`, set at signup and **immutable**. A user is one role for life; promotion or demotion requires creating a new user.

**Authorization predicates** live in `lib/services/_auth/`:

| Predicate                                | Rule                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `requireOrgAccess(ctx)`                  | actor must be `staff`, OR a customer with a `members` row for `ctx.orgId`                                                                  |
| `requireProjectAccess(ctx, projectId)`   | admin: yes. employee: yes if `project_assignments(user_id, project_id)` exists. customer: yes if `project.org_id = ctx.orgId`              |
| `requireTaskWrite(ctx, taskId)`          | admin: yes. employee: yes if assigned to the task or its project. customer: no (customers create work requests, not tasks)                 |
| `requireTaskRead(ctx, taskId)`           | admin: yes. employee: yes if assigned to project. customer: yes if `task.customer_visible = true` and customer has access to the project   |
| `requireDailyUpdateRead(ctx, updateId)`  | admin/employee: yes if project access. customer: yes if `visibility = 'customer_visible'` and customer has access to the project          |
| `requireCommentWrite(ctx, parentId)`     | yes if actor can read the parent and actor is not posting on behalf of someone else                                                        |
| `requireRole(ctx, role)`                 | exact role match                                                                                                                           |

`OrgContext` shape:

```ts
type OrgContext = {
  orgId: string;
  actor: {
    userId: string;
    role: 'customer' | 'employee' | 'admin';
    membershipOrgId: string | null;  // customers only — must equal orgId
  };
};
```

`buildOrgContext(request)` derives the context from the Better Auth session and the URL/route's implied org. Customers always have `orgId = membershipOrgId`. Staff have `membershipOrgId = null`; their `orgId` is the client org they are currently scoped to (via route param, header, or active selection).

### 5.1 Admin global context

A handful of admin operations have no org scope: listing all orgs, creating an org, listing users across orgs, viewing platform-wide audit data. These cannot use `OrgContext` because there is no `orgId`. They use a separate type:

```ts
type AdminContext = {
  kind: 'admin';
  actor: { userId: string; role: 'admin' };
};
```

Service-layer convention: any function whose data is org-scoped takes `OrgContext`. Functions that operate on the `organizations` table itself, or aggregate across orgs, take `AdminContext` and call `requireRole(ctx, 'admin')` first. The type tells you the scope. Phase 1 functions taking `AdminContext`: `organizations.listAll`, `organizations.create`, `users.listAllStaff`, `users.invite` (admin invites can target any org).

## 6. Data model

All ID columns are UUID v7 (sortable). Timestamps default `now()`. `created_at` / `updated_at` on every mutable table.

### 6.1 Better Auth tables (managed by plugin)

`users`, `sessions`, `accounts`, `verification_tokens`, `organizations`, `members`, `invitations`. Drizzle schemas mirror Better Auth's expected shape.

Extensions to `users`:

- `system_role enum('customer','employee','admin') not null` — set at signup, immutable
- `default_hourly_rate_cents int null`
- `timezone text not null default 'UTC'`
- `notification_preferences_set bool not null default false`

### 6.2 Domain tables

```sql
projects (
  id                uuid pk
  org_id            uuid not null references organizations(id)
  name              text not null
  description       text
  status            enum('draft','active','paused','completed','archived') not null default 'draft'
  service_type      enum('seo','paid_ads','social','content','web','other') not null
  start_date        date null
  end_date          date null
  hourly_rate_cents int null
  created_by        uuid not null references users(id)
  created_at        timestamptz
  updated_at        timestamptz
  archived_at       timestamptz null
);
create index on projects (org_id, status);

project_assignments (
  user_id     uuid references users(id),
  project_id  uuid references projects(id),
  assigned_at timestamptz,
  primary key (user_id, project_id)
);
create index on project_assignments (project_id);

tasks (
  id                uuid pk
  org_id            uuid not null references organizations(id)
  project_id        uuid null references projects(id)        -- null until admin assigns (see §8.6)
  title             text not null
  description       text
  status            enum('todo','in_progress','blocked','done','cancelled') not null default 'todo'
  priority          enum('low','normal','high','urgent') not null default 'normal'
  due_date          date null
  customer_visible  bool not null default true
  source            enum('admin_created','from_request') not null
  source_request_id uuid null references work_requests(id)
  created_by        uuid not null references users(id)
  created_at        timestamptz
  updated_at        timestamptz
  completed_at      timestamptz null,
  check (
    (source = 'admin_created' and source_request_id is null and project_id is not null)
    or
    (source = 'from_request'  and source_request_id is not null)
  )
);
create index on tasks (org_id, project_id, status);
create index on tasks (org_id, status, due_date) where status in ('todo','in_progress','blocked');
create index on tasks (org_id, status) where source = 'from_request' and project_id is null;  -- triage queue

task_assignments (
  task_id     uuid references tasks(id),
  user_id     uuid references users(id),
  assigned_at timestamptz,
  primary key (task_id, user_id)
);
create index on task_assignments (user_id);

task_status_log (
  id          uuid pk
  task_id     uuid not null references tasks(id)
  from_status text null    -- text rather than enum to survive enum value drops
  to_status   text not null
  changed_by  uuid not null references users(id)
  changed_at  timestamptz
  note        text
);
create index on task_status_log (task_id, changed_at);

time_entries (
  id                  uuid pk
  org_id              uuid not null references organizations(id)
  project_id          uuid not null references projects(id)
  task_id             uuid not null references tasks(id)
  user_id             uuid not null references users(id)
  minutes             int not null check (minutes > 0)
  logged_for_date     date not null
  note                text
  rate_cents_per_hour int null
  created_at          timestamptz
  updated_at          timestamptz
);
create index on time_entries (org_id, logged_for_date);
create index on time_entries (project_id, user_id, logged_for_date);

daily_updates (
  id            uuid pk
  org_id        uuid not null references organizations(id)
  project_id    uuid not null references projects(id)
  user_id       uuid not null references users(id)
  body          text not null
  activity_type enum('planning','execution','review','meeting','admin','other') not null
  visibility    enum('customer_visible','internal_only') not null default 'customer_visible'
  log_date      date not null
  created_at    timestamptz
  updated_at    timestamptz
);
create index on daily_updates (org_id, project_id, log_date desc);
create index on daily_updates (org_id, log_date desc) where visibility = 'customer_visible';

daily_update_tasks (
  daily_update_id uuid references daily_updates(id),
  task_id         uuid references tasks(id),
  primary key (daily_update_id, task_id)
);

daily_update_revisions (
  id              uuid pk
  daily_update_id uuid not null references daily_updates(id)
  body            text not null
  activity_type   text not null
  visibility      text not null
  edited_by       uuid not null references users(id)
  edited_at       timestamptz
);
create index on daily_update_revisions (daily_update_id, edited_at desc);

comments (
  id              uuid pk
  org_id          uuid not null references organizations(id)
  daily_update_id uuid not null references daily_updates(id)
  user_id         uuid not null references users(id)
  body            text not null
  created_at      timestamptz
  updated_at      timestamptz
  deleted_at      timestamptz null
);
create index on comments (daily_update_id, created_at);

comment_revisions (
  id         uuid pk
  comment_id uuid not null references comments(id)
  body       text not null
  edited_by  uuid not null references users(id)
  edited_at  timestamptz
);

work_requests (
  id               uuid pk
  org_id           uuid not null references organizations(id)
  submitted_by     uuid not null references users(id)
  project_id       uuid null references projects(id)
  title            text not null
  description      text
  priority_hint    enum('low','normal','high','urgent') not null default 'normal'
  status           enum('submitted','accepted','rejected','duplicate') not null default 'submitted'
  rejection_reason text
  reviewed_by      uuid null references users(id)
  reviewed_at      timestamptz null
  resolved_task_id uuid null references tasks(id)
  created_at       timestamptz
  updated_at       timestamptz
);
create index on work_requests (org_id, status, created_at);

work_request_status_log (
  id              uuid pk
  work_request_id uuid not null references work_requests(id)
  from_status     text null
  to_status       text not null
  changed_by      uuid not null references users(id)
  changed_at      timestamptz
  note            text
);

attachments (
  id           uuid pk
  org_id       uuid not null references organizations(id)
  parent_type  enum('daily_update','work_request','task','comment') not null
  parent_id    uuid not null
  uploaded_by  uuid not null references users(id)
  r2_key       text not null unique
  filename     text not null
  content_type text not null
  size_bytes   bigint not null
  status       enum('pending','ready','failed') not null default 'pending'
  created_at   timestamptz
  confirmed_at timestamptz null
);
create index on attachments (parent_type, parent_id);
create index on attachments (status, created_at) where status = 'pending';

notifications (
  id           uuid pk
  org_id       uuid not null references organizations(id)
  user_id      uuid not null references users(id)
  event_type   text not null
  payload      jsonb not null
  related_type text null
  related_id   uuid null
  read_at      timestamptz null
  created_at   timestamptz
);
create index on notifications (user_id, read_at, created_at desc);

notification_preferences (
  id             uuid pk
  user_id        uuid null references users(id)   -- null = org-wide default
  org_id         uuid not null references organizations(id)
  event_type     text not null
  in_app_enabled bool not null default true
  email_enabled  bool not null default true
);
-- Unique key handled with generated column or trigger because Postgres
-- can't put NULL-distinguishing constraint directly:
create unique index on notification_preferences (
  coalesce(user_id::text, '__org_default__'),
  org_id,
  event_type
);

notification_deliveries (
  id              uuid pk
  notification_id uuid not null references notifications(id)
  channel         enum('email','in_app') not null
  status          enum('queued','sent','failed') not null default 'queued'
  error_message   text
  sent_at         timestamptz null
  created_at      timestamptz
);
create index on notification_deliveries (status, created_at) where status = 'failed';

integrations (   -- Phase 2 hook; no UI in Phase 1
  id                      uuid pk
  org_id                  uuid not null references organizations(id)
  provider                text not null
  access_token_encrypted  bytea
  refresh_token_encrypted bytea
  connected_at            timestamptz null
  metadata                jsonb not null default '{}'::jsonb,
  unique (org_id, provider)
);
```

Notes:

- All `org_id` columns are `not null`. Service-layer queries that omit the filter fail loud (data leak surface = zero).
- `tasks` and `work_requests` form a **circular FK** (`tasks.source_request_id → work_requests.id`, `work_requests.resolved_task_id → tasks.id`). The Drizzle migration plan handles this in two steps: create both tables without these FKs first, then add the FK constraints in a follow-up migration. Because both columns are nullable, the submission flow's `INSERT work_requests; INSERT tasks; UPDATE work_requests` sequence works inside a single transaction.
- `tasks.project_id` is **nullable** so that a customer-submitted work request without a project can still auto-create a task (the unassigned task surfaces in the admin triage queue). Admin assigns `project_id` during accept. The CHECK constraint enforces that `admin_created` tasks always have a `project_id` — only `from_request` tasks may have a null `project_id`.
- Status logs (`task_status_log`, `work_request_status_log`) store `to_status` / `from_status` as `text` rather than the enum so future enum value removals don't orphan history rows.
- `daily_update_revisions` columns mirror the live row's columns at the time of the prior write — captured **before** `updated_at` is bumped on the live row.
- All deletes are physical except `comments`, which soft-delete via `deleted_at` to preserve thread context.

## 7. Service layer

### 7.1 Layout

```
lib/services/
  _auth/                 -- auth predicates, OrgContext builder
  _context.ts            -- OrgContext type
  _result.ts             -- Result, AppError, ok(), err()
  _events.ts             -- domain event names + payload types
  auth/                  -- Better Auth integration helpers
  projects/
    index.ts             -- public API
    internal.ts          -- helpers used only by this feature
    schemas.ts           -- Zod schemas for inputs
    test.ts              -- service tests (Vitest)
  tasks/
  time-entries/
  daily-updates/
  comments/
  work-requests/
  attachments/
  notifications/
  users/
```

### 7.2 Public function contract

Every public service function must:

1. Accept `(ctx: OrgContext, input: TypedInput) => Promise<Result<T, AppError>>`.
2. Validate `input` via Zod first; on failure return `err('validation', ...)`.
3. Call `requireOrgAccess(ctx)` and any feature-specific predicate (`requireProjectAccess`, `requireTaskWrite`, etc.). Predicate failure returns `err('unauthorized', ...)`.
4. Issue all DB queries inside a single Drizzle transaction. Every `select`/`insert`/`update`/`delete` includes `where(eq(table.org_id, ctx.orgId))` (or the equivalent join condition). Functions writing to status logs do so in the same transaction.
5. Emit domain events via `notifications.emit()` **after the transaction commits** (so we never notify on a rolled-back write).
6. Return `ok(result)` on success.

Example skeleton:

```ts
export async function createDailyUpdate(
  ctx: OrgContext,
  input: CreateDailyUpdateInput,
): Promise<Result<DailyUpdate, AppError>> {
  const parsed = createDailyUpdateSchema.safeParse(input);
  if (!parsed.success) return err('validation', 'Invalid input', { fields: zodIssuesToFields(parsed.error) });

  const accessCheck = await requireProjectAccess(ctx, parsed.data.projectId);
  if (!accessCheck.ok) return accessCheck;

  const update = await db.transaction(async (tx) => {
    const [row] = await tx.insert(dailyUpdates)
      .values({ ...parsed.data, orgId: ctx.orgId, userId: ctx.actor.userId })
      .returning();
    if (parsed.data.taskIds?.length) {
      await tx.insert(dailyUpdateTasks).values(
        parsed.data.taskIds.map((taskId) => ({ dailyUpdateId: row.id, taskId })),
      );
    }
    return row;
  });

  await notifications.emit('daily_update.posted', {
    orgId: ctx.orgId,
    actorId: ctx.actor.userId,
    dailyUpdateId: update.id,
    visibility: update.visibility,
  });

  return ok(update);
}
```

### 7.3 Cross-feature calls

Cross-feature reads/writes go through public service APIs, never through one feature's internal helpers. Example: `work-requests.submit` calls `tasks.createFromRequest` (a public function) rather than reaching into `tasks/internal.ts`.

## 8. Key workflows

### 8.1 Sign-up & invitation

- **Customers** are invited by an admin via Better Auth's `invitations` flow scoped to the customer's org. Invitation email carries a single-use token; landing page completes profile and selects password (or magic link / Google OAuth). On accept: `users` row created with `system_role = 'customer'`, `members` row created for the org.
- **Employees and admins** are invited by an admin via a separate flow that does not create a `members` row but does set `users.system_role`.

### 8.2 Login

Better Auth handles email+password, magic link, Google OAuth via its plugin model. After successful auth, `buildOrgContext(request)` derives the context. For customer users, the org is fixed (their `members` row). For staff, the org is determined by the URL (e.g., `/admin/orgs/{orgId}/...`) or a header set by the active-org switcher.

### 8.3 Daily update post

Inputs: `projectId`, `body`, `activityType`, `visibility`, `logDate`, `taskIds[]`.

```
within transaction:
  insert daily_updates
  insert daily_update_tasks (one row per taskId)
after commit:
  emit daily_update.posted
    → fans out to: customer users in org (if visibility = customer_visible)
                 + assignees of any referenced tasks (deduped, excluding actor)
```

Validation:
- `taskIds` must all belong to `projectId` and `ctx.orgId`.
- `logDate` must be ≤ today in actor's timezone.

### 8.4 Daily update edit

Inputs: `id`, partial fields.

```
within transaction:
  fetch existing row (with org_id check)
  if no diff -> return ok(existing)
  insert daily_update_revisions with PRIOR values
  update daily_updates with NEW values, bump updated_at
after commit:
  no notification on edit (chosen: too noisy in Phase 1)
```

### 8.5 Comment post / edit / delete

Same pattern as daily update. Soft-delete sets `deleted_at`; UI renders "[deleted]" placeholder. Editing captures `comment_revisions` before the write. Notification on `comment.posted` fans out to: the update's author + prior commenters on the same update (deduped, excluding actor).

### 8.6 Work request submission

Inputs: `title`, `description`, `priorityHint`, optional `projectId`. The customer dashboard's request form offers a project dropdown defaulting to "(General — admin will route)" so customers can submit without picking a project.

```
within transaction:
  insert work_requests (status = 'submitted', project_id = input.projectId or null)
  insert tasks (status = 'todo', source = 'from_request', source_request_id,
                project_id = work_request.project_id)   -- may be null until triage
  insert task_status_log (null → 'todo')
  update work_requests set resolved_task_id = task.id
after commit:
  emit work_request.submitted → all admins
```

When `tasks.project_id` is null, the task lives in the admin triage queue (indexed by the partial index `where source = 'from_request' and project_id is null`). It does not appear on customer or employee project pages until admin assigns a project.

### 8.7 Work request triage

Admin opens triage view, sees pending requests. Actions:

- **Accept**: set `work_requests.status = 'accepted'` and `reviewed_by/at`. If the linked task has no `project_id`, admin **must** pick one as part of accept (the form requires it). Optional inline edits to title/description/priority/assignments. Insert `work_request_status_log`. Task remains at `todo` and is now assignable.
- **Reject**: `work_requests.status = 'rejected'`, set `rejection_reason`. Linked task transitions to `cancelled` (insert into `task_status_log`). Both transitions in same transaction. If the rejected task had no project_id, the rejection still proceeds — the task is `cancelled` regardless.
- **Duplicate**: `work_requests.status = 'duplicate'`, `rejection_reason` includes pointer to canonical task. Linked task → `cancelled`.

After commit: `emit work_request.status_changed → submitted_by`.

### 8.8 Task status change

Allowed transitions:

```
todo        → in_progress, blocked, cancelled
in_progress → blocked, done, cancelled, todo
blocked     → todo, in_progress, cancelled
done        → in_progress (re-open)
cancelled   → todo (re-open)
```

`done → done` and other no-op transitions return ok without writing. On `→ done`, set `completed_at = now()`. On `→ todo / in_progress` from `done`, clear `completed_at`.

```
within transaction:
  update tasks (status, completed_at?)
  insert task_status_log
after commit:
  emit task.status_changed → all current assignees + customer users in org
```

### 8.9 Task assignment

Add or remove a row in `task_assignments`. Idempotent on add. On add, `emit task.assigned → newly added user(s)`. On remove, no notification.

### 8.10 Time entry log

Inputs: `taskId`, `minutes`, `loggedForDate`, `note?`. The function:

1. Validates `taskId` belongs to `ctx.orgId`. **Rejects with `validation` error if `task.project_id` is null** (untriaged tasks can't accumulate time — admin must accept the request and assign a project first).
2. Authorizes: admin yes; employee yes if `project_assignments(user_id, task.project_id)` exists; customer no.
3. Resolves `rate_cents_per_hour`: project rate → user's `default_hourly_rate_cents` → null.
4. Inserts the row, denormalizing `project_id` from the task.

**Edit / delete policy.** A time entry is editable by its owner or any admin. There is no edit history table; the audit trail is just `updated_at`. Customers and unrelated employees cannot edit time entries. Phase 2 may add a lock-on-export mechanism for billing immutability.

### 8.11 File upload

```
1. Client picks file → calls Server Action `attachments.getUploadUrl`
   { parentType, parentId, filename, contentType, sizeBytes }
2. Service:
   - validates parent ownership (ctx.orgId match + parent visible to actor)
   - validates contentType (whitelist) and sizeBytes (≤ 50 MB)
   - generates r2_key = `${orgId}/${parentType}/${attachmentId}/${filename}`
   - inserts attachments row (status = 'pending')
   - returns presigned R2 PUT URL (expires in 10 min)
3. Client PUTs file directly to R2.
4. Client calls Server Action `attachments.confirm({ id })`.
5. Service:
   - HEADs the R2 object, verifies size matches
   - sets attachments.status = 'ready', confirmed_at = now()
6. Daily Vercel cron at /api/cron/gc-pending deletes any `attachments` row
   with status = 'pending' AND created_at < now() - 1 hour. Also deletes
   the orphan R2 object if present.
```

Per-batch UI cap: 5 files. Whitelist: `image/png|jpeg|webp|gif`, `application/pdf`, common Office mimetypes (docx/xlsx/pptx), `text/plain`, `text/csv`.

### 8.12 Notification dispatch

```ts
notifications.emit(eventType, payload)
  // 1. Resolve recipients per event type (see §9.2)
  // 2. For each recipient:
  //    a. Resolve effective preference (user override → org default → fallback true)
  //    b. Insert notifications row
  //    c. If in_app: insert notification_deliveries(channel='in_app', status='sent')
  //    d. If email: dispatch.afterResponse(() => sendEmail(notification))
  //                 sendEmail writes notification_deliveries(channel='email')
  //                 with status='sent' or 'failed'+error_message
```

`dispatch.afterResponse` is a thin wrapper around `unstable_after()` — Phase 2 swaps it for an Inngest enqueue without touching call sites.

## 9. Notifications

### 9.1 Events (Phase 1)

| `event_type`                  | Recipients                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `daily_update.posted`         | All customer users in `org_id` (if visibility=customer_visible) + assignees of referenced tasks  |
| `comment.posted`              | The update's author + prior commenters on that update (deduped, excludes actor)                  |
| `work_request.submitted`      | All admins                                                                                       |
| `work_request.status_changed` | The request's `submitted_by`                                                                     |
| `task.assigned`               | The newly assigned user(s)                                                                       |
| `task.status_changed`         | All current assignees + customer users in org (if `customer_visible = true`)                     |

Customers receive a notification on **every** task status flip (not only terminal states) — chosen for transparency over signal noise.

Comments on `internal_only` updates emit notifications only to staff recipients; no customer is ever notified.

### 9.2 Preferences

`notification_preferences` resolution at send time:

1. Look up `(user_id, org_id, event_type)` — if found, use it.
2. Else look up `(user_id = null, org_id, event_type)` — if found, use it.
3. Else fall back to `in_app_enabled = true, email_enabled = true`.

Admin can edit org-wide defaults via the admin settings page. Each user can override their own preferences via account settings.

### 9.3 Delivery

- **In-app**: synchronous DB write (`notifications` + `notification_deliveries(channel='in_app', status='sent')`). Bell icon polls `/api/notifications/unread-count` every 30 seconds. Notifications page paginates with `(user_id, created_at desc)` index.
- **Email**: Resend, dispatched via `dispatch.afterResponse`. Templates in `lib/email/templates/` using React Email. Failures recorded in `notification_deliveries(status='failed', error_message)`. Phase 1 has no retry; admin can manually trigger resend in Phase 2.

## 10. File storage

- **Bucket**: single Cloudflare R2 bucket per environment.
- **Key layout**: `{org_id}/{parent_type}/{attachment_id}/{filename}`. Org prefix simplifies any future per-tenant export or deletion.
- **Access**: presigned PUT URLs (10-min expiry) for upload. Presigned GET URLs (15-min expiry) for download — never expose the bucket publicly.
- **Limits**: ≤ 50 MB per file, ≤ 5 files per upload batch (UI-enforced; service re-validates).
- **MIME whitelist**: see §8.11.
- **GC**: daily cron deletes pending rows older than 1 hour.

## 11. Error handling

`AppError` is a discriminated union by `code`:

```ts
export type AppError =
  | { code: 'unauthorized';  message: string }
  | { code: 'not_found';     message: string }
  | { code: 'validation';    message: string; fields?: Record<string, string> }
  | { code: 'conflict';      message: string }
  | { code: 'rate_limit';    message: string }
  | { code: 'server';        message: string };

export type Result<T, E = AppError> =
  | { ok: true;  data: T }
  | { ok: false; error: E };

export const ok  = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (code: AppError['code'], message: string, extra?: Partial<AppError>): Result<never> =>
  ({ ok: false, error: { code, message, ...extra } as AppError });
```

All Server Actions return `Result<T, AppError>`. Client code:

```tsx
const result = await createProject(input);
if (!result.ok) {
  if (result.error.code === 'validation') setFieldErrors(result.error.fields);
  else toast.error(result.error.message);
  return;
}
// use result.data
```

Unhandled exceptions inside service functions are caught by a top-level wrapper: log via Pino with stack + `ctx.actor.userId` + `ctx.orgId`; return `err('server', 'Unexpected error')`. Stack traces never leak to clients.

## 12. Validation

- All Server Action inputs validated via Zod, schemas co-located with the service action (`lib/services/<feature>/schemas.ts`).
- Drizzle table types feed into Zod via `drizzle-zod`'s `createInsertSchema` / `createSelectSchema`, then refined with business rules (string lengths, allowed values, cross-field constraints).
- Re-export schemas to clients for form-level validation parity.
- `lib/env.ts` validates env vars on cold start with Zod; missing/malformed env vars crash the app at boot.

## 13. Testing strategy

**Service layer (integration tests)** — the bulk of test coverage.

- Vitest. Each test runs inside a Postgres transaction wrapped in `BEGIN ... ROLLBACK` for full isolation. Setup uses Drizzle migrations against an empty database.
- Local dev: Postgres via Docker (`docker compose up db`).
- CI: Neon branches per PR, provisioned via Vercel/Neon integration; cleaned up on PR close.
- Tests exercise real Drizzle, real schema, real authorization predicates. Mocks only at the email/R2 boundary.

**UI components (unit tests)** — Vitest + React Testing Library. Mock at the Server Action boundary using a typed test-double helper.

**E2E (Playwright)** — three flows in Phase 1:

1. Auth: sign up + log in for each role (customer / employee / admin).
2. Customer submits work request → admin triages (accept) → customer sees status change.
3. Employee posts daily update with attachment → customer comments → employee receives in-app notification.

**TDD discipline**: for every new service function, write the failing test first, watch it fail, implement, watch it pass, refactor. Transactional isolation keeps the red-green-refactor loop tight — tests don't pay schema-reset cost between runs.

## 14. Project structure

```
app/
  (auth)/
    login/, signup/, forgot/, reset/, verify/
  (customer)/
    dashboard/
    projects/[projectId]/
      updates/, tasks/
    requests/
      new/, [requestId]/
    notifications/, settings/
  (employee)/
    dashboard/
    projects/[projectId]/
      updates/new/, time/
    notifications/, settings/
  (admin)/
    dashboard/
    orgs/, users/, projects/
    requests/                 -- triage queue
    assignments/
    notifications/, settings/
  api/
    auth/[...all]/route.ts    -- Better Auth handler
    cron/gc-pending/route.ts  -- Vercel cron
    notifications/unread-count/route.ts

lib/
  db/
    client.ts
    schema/                   -- one file per table
    migrations/               -- generated by Drizzle Kit
  services/
    _auth/, _context.ts, _result.ts, _events.ts
    auth/, projects/, tasks/, time-entries/, daily-updates/,
    comments/, work-requests/, attachments/, notifications/, users/
  validation/                 -- shared Zod refinements
  email/
    templates/                -- React Email
    send.ts
  storage/
    r2-client.ts
    signed-urls.ts
  notifications/
    dispatch.ts               -- unstable_after wrapper
    in-app.ts
  better-auth/
    config.ts
  env.ts                      -- env-var Zod schema
  log.ts                      -- Pino logger

components/
  ui/                         -- shadcn primitives
  app/                        -- domain components

tests/
  unit/                       -- UI + utility tests
  integration/                -- service-layer tests
  e2e/                        -- Playwright
  fixtures/                   -- factory helpers (createUser, createProject, ...)

docker-compose.yml            -- local Postgres
drizzle.config.ts
vercel.json
.env.example
```

## 15. Deployment & operations

- **Platform**: Vercel. Default Node runtime; no Edge Runtime in Phase 1 (DB and Better Auth need Node APIs).
- **Database**: Neon prod branch + per-PR Neon branch via Vercel/Neon integration. HTTP pooler for Server Actions; WebSocket pooler for streaming Server Components.
- **Migrations**: `pnpm drizzle:generate` produces SQL files committed to git. Vercel build runs `pnpm drizzle:migrate` as part of build (`vercel.json`'s `buildCommand`). Failed migrations fail the build.
- **Storage**: single R2 bucket per env. CORS configured for direct browser PUT.
- **Email**: Resend with verified sender domain. `lib/email/send.ts` wraps it.
- **Secrets**: Vercel env vars, validated by `lib/env.ts` Zod schema on cold start. Required vars:
  ```
  DATABASE_URL
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  RESEND_API_KEY
  RESEND_FROM_EMAIL
  R2_ACCOUNT_ID
  R2_ACCESS_KEY
  R2_SECRET_KEY
  R2_BUCKET
  R2_PUBLIC_HOST
  GOOGLE_OAUTH_CLIENT_ID
  GOOGLE_OAUTH_CLIENT_SECRET
  APP_URL
  CRON_SECRET           -- shared secret Vercel Cron sends as Authorization: Bearer <CRON_SECRET>
  ```
- **Backups**: Neon's daily PITR (built-in).
- **Observability**: Pino structured logs to stdout (Vercel collects). Sentry deferred to Phase 2.

## 16. Phase 2 architectural hooks present in Phase 1

| Phase 2 capability                  | Phase 1 hook                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| HubSpot / Meta / IG / LinkedIn sync | `integrations` table from day 1, no UI                                                        |
| Inngest / external job queue        | `dispatch.afterResponse(fn)` abstraction wrapping `unstable_after`                            |
| Postgres RLS as defense in depth    | All `org_id` columns non-null + service-layer boundary; RLS adds without code change          |
| Passkeys / 2FA / SAML               | Better Auth plugin model — config-only addition                                               |
| Threaded comments                   | `comments` table can extend with `parent_comment_id` later                                    |
| Comments on tasks / work requests   | Polymorphic `comments.parent_*` extension or per-parent join tables                           |
| Real-time push                      | Swap polling endpoint for SSE; in-app delivery already records to `notification_deliveries`   |
| Per-customer-user project ACL       | New `project_visibility` table; service layer adds an extra check                             |
| Time-entry approval / billing exports | All time-entry data already captured with snapshotted rates                                  |

## 17. Decisions log

- **A1: Service-layer discipline + typed `OrgContext`** — chosen over RLS to keep migrations simple at this stage. Lint rule (`no-restricted-imports`) enforces. RLS is an additive Phase 2 option without touching service code.
- **B1: Result types** — every Server Action returns `Result<T, AppError>`. No exceptions cross the wire.
- **C1: Functional services** — pure async functions, not class instances. DI overhead unnecessary at this scale.
- **Tenancy: staff are global, customers belong to client orgs** — staff have no `members` row; `users.system_role` is the source of truth. Cross-org access for staff goes through `project_assignments`.
- **`system_role` immutable** — promoting a customer to staff requires creating a new user.
- **Multiple assignees per task** — `task_assignments` join table; no "lead" role.
- **Time entries strictly require `task_id`** — non-task time (meetings, training) is out of Phase 1 scope.
- **Rate snapshotted on each time entry** — rate changes don't retroactively alter prior entries.
- **Daily updates and time entries independent** — narrative vs billing data stay decoupled; UI offers shortcuts to log time alongside an update.
- **Edit history**: full revisions for daily updates and comments; lightweight status logs for tasks and work requests.
- **Polymorphic `attachments`** — single table with `(parent_type, parent_id)`. App-level integrity, not FK.
- **Customers notified on every task status flip** — verbosity over silent surprises.
- **Admin work-request fan-out: all admins** — granular routing is Phase 2.
- **Auth: email+password + magic link + Google OAuth** — passkeys/2FA deferred.
- **In-app notifications via 30s polling** — SSE deferred until volume justifies.
- **Local Postgres (Docker) for dev tests; Neon branches in CI** — fast TDD loop, real Neon coverage on PRs.
- **No external job queue in Phase 1** — `unstable_after` for email; abstraction lets us swap to Inngest later.
- **Single Bucket R2 with org-prefixed keys** — multi-bucket per org is Phase 2+ if ever needed.
- **`tasks.project_id` is nullable** — supports customer-filed requests without a project, surfaced in the admin triage queue. Admin must assign `project_id` on accept. CHECK constraint forbids null `project_id` on `admin_created` tasks.
- **Two context types** — `OrgContext` for org-scoped operations (most of the system) and `AdminContext` for admin-global operations on the orgs table itself (list/create org, list all staff). Type-level distinction prevents accidental cross-tenant queries.

## 18. Open questions

None at design time. Anything that comes up during implementation gets logged in this file under §19 with date and resolution.

## 19. Implementation-time amendments

(empty)
