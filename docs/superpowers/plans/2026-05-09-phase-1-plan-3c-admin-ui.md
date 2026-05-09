# Phase 1 — Plan 3c: Admin UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the admin-facing UI — dashboard with pending work-request count + active projects, projects list/detail with team management, projects create form, work request review queue with accept/reject/mark-duplicate flows, notifications. Reuses the Server Actions infrastructure from Plans 3a/3b; adds an *admin* set of wrappers that take `orgId` as the first parameter (since admins are not in the `members` table — `staffOrgId` must be threaded through `withSessionContext`).

**Architecture:** URL convention is `/admin/orgs/[orgId]/...`. The admin's "active org" is encoded in the URL — Phase 1 has one seeded org so `/admin/dashboard` redirects to the first org's dashboard. Pages are Server Components by default; forms + accept/reject/duplicate buttons are `"use client"`. Admin Server Action wrappers live in `lib/server-actions/admin/<feature>.ts` and call `withSessionContext(callback, { staffOrgId: orgId })`.

**Tech Stack:** Same as Plans 3a/3b (Next.js 15, Server Actions, react-hook-form patterns we already use, shadcn/ui, date-fns, lucide-react).

**Branch:** Implement on `feat/phase-1-admin-ui`, branched from `main`. Last main commit at start: the Plan-3b merge (`621659f`).

---

## File structure created by this plan

```
lib/server-actions/admin/
  projects.ts                       (NEW — list/get/create/update/assign/unassign with orgId)
  work-requests.ts                  (NEW — list/get/accept/reject/markDuplicate with orgId)
  tasks.ts                          (NEW — list/get/assign/unassign/changeStatus with orgId)
  notifications.ts                  (NEW — list/markRead with orgId)
  users.ts                          (NEW — listOrgMembers with orgId)
  orgs.ts                           (NEW — listOrgs visible to admin; no orgId needed)

app/admin/
  layout.tsx                        (REPLACED — minimal wrapper; per-org layout under [orgId])
  dashboard/page.tsx                (REPLACED — redirects to /admin/orgs/[firstOrgId]/dashboard)
  orgs/
    page.tsx                        (lists all orgs; admin picks one)
    [orgId]/
      layout.tsx                    (per-org admin layout — nav + bell + sign out)
      dashboard/page.tsx            (admin dashboard for the org)
      projects/
        page.tsx                    (projects list)
        new/page.tsx                (create project form)
        [projectId]/
          page.tsx                  (detail: meta + team + tasks + updates)
      work-requests/
        page.tsx                    (review queue)
        [requestId]/page.tsx        (review detail with accept/reject/duplicate)
      notifications/page.tsx        (notifications list)

components/app/
  admin-notifications-list.tsx     (admin-specific deep links)
  project-create-form.tsx          ("use client")
  project-team-manager.tsx         ("use client" — assign/unassign people)
  work-request-review-bar.tsx      ("use client" — accept/reject/duplicate buttons)

tests/e2e/
  admin-accept-request.spec.ts     (1 new E2E)
```

---

## Tasks

### Task 1: Admin Server Action wrappers

**Files:**
- Create: `lib/server-actions/admin/projects.ts`
- Create: `lib/server-actions/admin/work-requests.ts`
- Create: `lib/server-actions/admin/tasks.ts`
- Create: `lib/server-actions/admin/notifications.ts`
- Create: `lib/server-actions/admin/users.ts`
- Create: `lib/server-actions/admin/orgs.ts`

Each admin wrapper takes `orgId: string` as the first argument and passes it to `withSessionContext` via `{ staffOrgId: orgId }`. The `lib/server-actions/admin/orgs.ts` is the exception — it does NOT take orgId because it lists all orgs the admin can see.

- [ ] **Step 1: `admin/projects.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as projects from "@/lib/services/projects";

export async function adminListProjectsAction(orgId: string, input: projects.ListProjectsInput = {}) {
  return withSessionContext((db, ctx) => projects.listProjects(db, ctx, input), { staffOrgId: orgId });
}

export async function adminGetProjectAction(orgId: string, projectId: string) {
  return withSessionContext((db, ctx) => projects.getProject(db, ctx, projectId), { staffOrgId: orgId });
}

export async function adminCreateProjectAction(orgId: string, input: projects.CreateProjectInput) {
  const r = await withSessionContext((db, ctx) => projects.createProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
  return r;
}

export async function adminUpdateProjectAction(orgId: string, input: projects.UpdateProjectInput) {
  const r = await withSessionContext((db, ctx) => projects.updateProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/projects", "layout");
    revalidatePath("/customer/projects", "layout");
  }
  return r;
}

export async function adminAssignToProjectAction(orgId: string, input: projects.AssignmentInput) {
  const r = await withSessionContext((db, ctx) => projects.assignToProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/projects/${input.projectId}`, "page");
  return r;
}

export async function adminUnassignFromProjectAction(orgId: string, input: projects.AssignmentInput) {
  const r = await withSessionContext((db, ctx) => projects.unassignFromProject(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/projects/${input.projectId}`, "page");
  return r;
}
```

- [ ] **Step 2: `admin/work-requests.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as workRequests from "@/lib/services/work-requests";

export async function adminListWorkRequestsAction(orgId: string, input: workRequests.ListWorkRequestsInput = {}) {
  return withSessionContext((db, ctx) => workRequests.listWorkRequests(db, ctx, input), { staffOrgId: orgId });
}

export async function adminGetWorkRequestAction(orgId: string, id: string) {
  return withSessionContext((db, ctx) => workRequests.getWorkRequest(db, ctx, id), { staffOrgId: orgId });
}

export async function adminAcceptWorkRequestAction(orgId: string, input: workRequests.AcceptWorkRequestInput) {
  const r = await withSessionContext(
    (db, ctx) => workRequests.acceptWorkRequest(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/work-requests`, "layout");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
    revalidatePath("/customer/requests", "layout");
  }
  return r;
}

export async function adminRejectWorkRequestAction(orgId: string, input: workRequests.RejectWorkRequestInput) {
  const r = await withSessionContext(
    (db, ctx) => workRequests.rejectWorkRequest(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/work-requests`, "layout");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
    revalidatePath("/customer/requests", "layout");
  }
  return r;
}

export async function adminMarkDuplicateWorkRequestAction(orgId: string, input: workRequests.MarkDuplicateWorkRequestInput) {
  const r = await withSessionContext(
    (db, ctx) => workRequests.markDuplicateWorkRequest(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/work-requests`, "layout");
    revalidatePath(`/admin/orgs/${orgId}/dashboard`, "page");
    revalidatePath("/customer/requests", "layout");
  }
  return r;
}
```

- [ ] **Step 3: `admin/tasks.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as tasks from "@/lib/services/tasks";

export async function adminListTasksAction(orgId: string, input: tasks.ListTasksInput = {}) {
  return withSessionContext((db, ctx) => tasks.listTasks(db, ctx, input), { staffOrgId: orgId });
}

export async function adminGetTaskAction(orgId: string, id: string) {
  return withSessionContext((db, ctx) => tasks.getTask(db, ctx, id), { staffOrgId: orgId });
}

export async function adminAssignTaskAction(orgId: string, input: tasks.TaskAssignmentInput) {
  const r = await withSessionContext((db, ctx) => tasks.assignTask(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/tasks", "page");
    revalidatePath("/employee/dashboard", "page");
  }
  return r;
}

export async function adminUnassignTaskAction(orgId: string, input: tasks.TaskAssignmentInput) {
  const r = await withSessionContext((db, ctx) => tasks.unassignTask(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/tasks", "page");
  }
  return r;
}

export async function adminChangeTaskStatusAction(orgId: string, input: tasks.ChangeTaskStatusInput) {
  const r = await withSessionContext((db, ctx) => tasks.changeTaskStatus(db, ctx, input), { staffOrgId: orgId });
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}/projects`, "layout");
    revalidatePath("/employee/tasks", "page");
  }
  return r;
}
```

- [ ] **Step 4: `admin/notifications.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as notifications from "@/lib/services/notifications";

export async function adminListNotificationsAction(orgId: string, input: notifications.ListNotificationsInput = {}) {
  return withSessionContext((db, ctx) => notifications.listNotifications(db, ctx, input), { staffOrgId: orgId });
}

export async function adminMarkNotificationsReadAction(orgId: string, input: notifications.MarkNotificationsReadInput) {
  const r = await withSessionContext(
    (db, ctx) => notifications.markNotificationsRead(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) revalidatePath(`/admin/orgs/${orgId}/notifications`, "page");
  return r;
}
```

- [ ] **Step 5: `admin/users.ts`**

```ts
"use server";

import { withSessionContext } from "../_action";
import * as users from "@/lib/services/users";

export async function adminListOrgMembersAction(orgId: string, input: users.ListOrgMembersInput = {}) {
  return withSessionContext((db, ctx) => users.listOrgMembers(db, ctx, input), { staffOrgId: orgId });
}
```

- [ ] **Step 6: `admin/orgs.ts`**

This wrapper does NOT take `orgId` — it lists orgs. We need a thin service helper for "list all orgs an admin can see." Phase 1 admins see ALL orgs. We'll add a tiny wrapper in `lib/services/orgs/index.ts` if it doesn't already exist.

First check if `lib/services/orgs/index.ts` exists. If NOT, create it:

```ts
// lib/services/orgs/index.ts
import "server-only";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { ok, err, type Result } from "@/lib/services/_result";
import { requireRole } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Org = typeof schema.organizations.$inferSelect;

export async function listOrgs(db: AnyDb, ctx: OrgContext): Promise<Result<Org[]>> {
  const role = requireRole(ctx, "admin");
  if (!role.ok) return role;
  const rows = await db.select().from(schema.organizations).orderBy(schema.organizations.name);
  return ok(rows);
}
```

If it already exists, just verify it has a `listOrgs` export.

Then create `lib/server-actions/admin/orgs.ts`:

```ts
"use server";

import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as orgsService from "@/lib/services/orgs";

/**
 * Admin-only: list all organizations.
 *
 * This wrapper does not use `withSessionContext` because admins without a
 * picked org can't construct an OrgContext. We do the role check inline using
 * the Better Auth session + the user's systemRole, then call the service with
 * a minimal context.
 */
export async function adminListOrgsAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false as const, error: { code: "unauthorized" as const, message: "Not signed in" } };

  const [user] = await db
    .select({ systemRole: schema.users.systemRole })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user || user.systemRole !== "admin") {
    return { ok: false as const, error: { code: "unauthorized" as const, message: "Admin role required" } };
  }

  // Build a synthetic admin context with the first org so requireRole passes.
  const [firstOrg] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .limit(1);
  if (!firstOrg) return { ok: true as const, data: [] };

  return orgsService.listOrgs(db, {
    kind: "org",
    orgId: firstOrg.id,
    actor: { userId: session.user.id, role: "admin", membershipOrgId: null },
  });
}
```

- [ ] **Step 7: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
git checkout -b feat/phase-1-admin-ui   # branch already exists; the controller created it
git add lib/server-actions/admin lib/services/orgs
git commit -m "feat(server-actions): admin wrappers (projects/work-requests/tasks/notifications/users/orgs)"
```

NOTE: The controller has already created `feat/phase-1-admin-ui`. Skip the `git checkout -b` and just commit on the current branch.

Expected: 214 vitest tests still pass; gates clean.

---

### Task 2: Admin layout (top-level + per-org) and `/admin/dashboard` redirect

**Files:**
- Replace: `app/admin/layout.tsx` (top-level — minimal pass-through)
- Replace: `app/admin/dashboard/page.tsx` (redirects to first org)
- Create: `app/admin/orgs/page.tsx` (org picker — lists all orgs)
- Create: `app/admin/orgs/[orgId]/layout.tsx` (per-org layout with nav + bell + sign out)

Top-level admin layout is intentionally minimal — the per-org layout under `[orgId]` is where the actual nav lives. This lets us have an org-picker at `/admin/orgs` without the per-org chrome.

- [ ] **Step 1: Top-level `app/admin/layout.tsx`** (replace)

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  return <>{children}</>;
}
```

The middleware (Plan 1) already gates the `/admin` tree by `system_role = 'admin'`, so we only need the session-presence check here. The per-org layout will add the chrome.

- [ ] **Step 2: `app/admin/dashboard/page.tsx`** (replace)

```tsx
import { redirect } from "next/navigation";
import { adminListOrgsAction } from "@/lib/server-actions/admin/orgs";

export default async function AdminDashboardRedirectPage() {
  const r = await adminListOrgsAction();
  if (r.ok && r.data.length > 0) {
    redirect(`/admin/orgs/${r.data[0]!.id}/dashboard`);
  }
  redirect("/admin/orgs");
}
```

- [ ] **Step 3: `app/admin/orgs/page.tsx`** (org picker)

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminListOrgsAction } from "@/lib/server-actions/admin/orgs";

export default async function AdminOrgsPage() {
  const r = await adminListOrgsAction();
  const orgs = r.ok ? r.data : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Pick an organization</h1>
      {orgs.length === 0 ? (
        <p className="text-sm text-slate-500">No organizations yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => (
            <Card key={o.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/admin/orgs/${o.id}/dashboard`} className="hover:underline">
                    {o.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500">{o.slug}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `app/admin/orgs/[orgId]/layout.tsx`** (per-org chrome)

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/better-auth/config";
import { headers } from "next/headers";
import { adminListOrgsAction } from "@/lib/server-actions/admin/orgs";
import { adminListNotificationsAction } from "@/lib/server-actions/admin/notifications";
import { NotificationsBell } from "@/components/app/notifications-bell";

async function signOutAction() {
  "use server";
  const { redirect } = await import("next/navigation");
  const { headers } = await import("next/headers");
  const { auth } = await import("@/lib/better-auth/config");
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export default async function AdminOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const orgsR = await adminListOrgsAction();
  if (!orgsR.ok) notFound();
  const org = orgsR.data.find((o) => o.id === orgId);
  if (!org) notFound();

  const session = await auth.api.getSession({ headers: await headers() });

  const notifs = await adminListNotificationsAction(orgId, { filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href={`/admin/orgs/${orgId}/dashboard`} className="font-semibold">
              Marketing CRM · Admin
            </Link>
            <nav aria-label="Admin" className="flex items-center gap-4 text-sm">
              <Link href={`/admin/orgs/${orgId}/dashboard`} className="hover:underline">Dashboard</Link>
              <Link href={`/admin/orgs/${orgId}/projects`} className="hover:underline">Projects</Link>
              <Link href={`/admin/orgs/${orgId}/work-requests`} className="hover:underline">Work requests</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell initialUnreadCount={initialUnread} href={`/admin/orgs/${orgId}/notifications`} />
            <span className="text-sm text-slate-600">{org.name}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-sm text-slate-600">{session?.user.name ?? session?.user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-sm text-slate-600 hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
```

NOTE: `NotificationsBell` was extended in Plan 3b Task 2 to accept `href`. The bell still polls via `listNotificationsAction` (the customer-side wrapper that has no orgId) — that's a small bug for admin-side polling. We'll defer fixing the polling for admin; for Phase 1 the initial unread count is correct on each page load.

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add app/admin
git commit -m "feat(admin): top-level + per-org layout with org picker and dashboard redirect"
```

---

### Task 3: Admin dashboard (per-org)

**Files:**
- Create: `app/admin/orgs/[orgId]/dashboard/page.tsx`

Composes: pending work request count + active projects count + recent updates feed + recent work requests.

- [ ] **Step 1: Implement**

```tsx
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "default",
  accepted: "secondary",
  rejected: "destructive",
  duplicate: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [submittedR, projectsR, recentR] = await Promise.all([
    adminListWorkRequestsAction(orgId, { status: "submitted" }),
    adminListProjectsAction(orgId, { status: "active" }),
    adminListWorkRequestsAction(orgId, {}),
  ]);

  const pending = submittedR.ok ? submittedR.data.length : 0;
  const activeProjects = projectsR.ok ? projectsR.data.length : 0;
  const recent = recentR.ok ? recentR.data.slice(0, 5) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Pending work requests</CardDescription>
            <CardTitle className="text-3xl">{pending}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/work-requests?status=submitted`}
              className="text-sm text-blue-600 hover:underline"
            >
              Review queue →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Active projects</CardDescription>
            <CardTitle className="text-3xl">{activeProjects}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/projects`}
              className="text-sm text-blue-600 hover:underline"
            >
              View all →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>New project</CardDescription>
            <CardTitle className="text-base font-normal">Create one</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/projects/new`}
              className="text-sm text-blue-600 hover:underline"
            >
              + New project →
            </Link>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-medium">Recent work requests</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/orgs/${orgId}/work-requests/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {format(new Date(r.submittedAt), "MMM d, yyyy h:mm a")}
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="text-xs">
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add "app/admin/orgs/[orgId]/dashboard/page.tsx"
git commit -m "feat(admin): per-org dashboard with KPIs + recent work requests"
```

---

### Task 4: Admin projects list

**Files:**
- Create: `app/admin/orgs/[orgId]/projects/page.tsx`

Same shape as the customer/employee projects list, but routes go to admin URL and shows draft status (which customers don't see).

- [ ] **Step 1: Implement**

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  paid_ads: "Paid Ads",
  social: "Social",
  content: "Content",
  web: "Web",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  draft: "Draft",
};

export default async function AdminProjectsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const r = await adminListProjectsAction(orgId, {});
  const projects = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link
          href={`/admin/orgs/${orgId}/projects/new`}
          className={cn(buttonVariants())}
        >
          <Plus className="mr-2 h-4 w-4" />
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">No projects yet. Create one to get started.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link
                      href={`/admin/orgs/${orgId}/projects/${p.id}`}
                      className="hover:underline"
                    >
                      {p.name}
                    </Link>
                  </CardTitle>
                  <Badge variant="secondary">{STATUS_LABELS[p.status] ?? p.status}</Badge>
                </div>
                <CardDescription>{SERVICE_TYPE_LABELS[p.serviceType] ?? p.serviceType}</CardDescription>
              </CardHeader>
              {p.description && (
                <CardContent className="text-sm text-slate-600 line-clamp-2">
                  {p.description}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add "app/admin/orgs/[orgId]/projects/page.tsx"
git commit -m "feat(admin): projects list with new-project link"
```

---

### Task 5: Project create form

**Files:**
- Create: `components/app/project-create-form.tsx`
- Create: `app/admin/orgs/[orgId]/projects/new/page.tsx`

- [ ] **Step 1: ProjectCreateForm (client)**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { adminCreateProjectAction } from "@/lib/server-actions/admin/projects";

const SERVICE_TYPES = ["seo", "paid_ads", "social", "content", "web", "other"] as const;

const SERVICE_TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  paid_ads: "Paid Ads",
  social: "Social",
  content: "Content",
  web: "Web",
  other: "Other",
};

export function ProjectCreateForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceType, setServiceType] = useState<typeof SERVICE_TYPES[number]>("seo");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);

    const rateCents =
      hourlyRate.trim() === ""
        ? undefined
        : Math.round(Number.parseFloat(hourlyRate) * 100);
    if (hourlyRate.trim() !== "" && (Number.isNaN(rateCents) || rateCents! <= 0)) {
      setFieldErrors({ hourlyRateCents: "Must be a positive number" });
      setPending(false);
      return;
    }

    const r = await adminCreateProjectAction(orgId, {
      name,
      description: description || undefined,
      serviceType,
      hourlyRateCents: rateCents,
    });
    setPending(false);
    if (!r.ok) {
      if (r.error.code === "validation" && r.error.fields) {
        setFieldErrors(r.error.fields);
      }
      setError(r.error.message);
      return;
    }
    router.push(`/admin/orgs/${orgId}/projects/${r.data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          required
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {fieldErrors.name && <p className="text-sm text-red-600">{fieldErrors.name}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          rows={4}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="serviceType">Service type</Label>
          <Select
            value={serviceType}
            onValueChange={(v) => v && setServiceType(v as typeof SERVICE_TYPES[number])}
          >
            <SelectTrigger id="serviceType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SERVICE_TYPE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldErrors.serviceType && <p className="text-sm text-red-600">{fieldErrors.serviceType}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hourlyRate">Hourly rate (USD, optional)</Label>
          <Input
            id="hourlyRate"
            type="number"
            min="0"
            step="0.01"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="e.g. 150.00"
          />
          {fieldErrors.hourlyRateCents && <p className="text-sm text-red-600">{fieldErrors.hourlyRateCents}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Page**

Create `app/admin/orgs/[orgId]/projects/new/page.tsx`:

```tsx
import { ProjectCreateForm } from "@/components/app/project-create-form";

export default async function AdminNewProjectPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New project</h1>
      <ProjectCreateForm orgId={orgId} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/project-create-form.tsx "app/admin/orgs/[orgId]/projects/new"
git commit -m "feat(admin): project create form (name/description/service-type/hourly-rate)"
```

---

### Task 6: Project detail with team management

**Files:**
- Create: `components/app/project-team-manager.tsx` (`"use client"`)
- Create: `app/admin/orgs/[orgId]/projects/[projectId]/page.tsx`

The detail page shows project meta + team (assigned employees) + tasks + recent updates. Team management is inline: assign / unassign with a `<Select>` populated from `adminListOrgMembersAction` filtered to staff (employee/admin).

- [ ] **Step 1: ProjectTeamManager (client)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X } from "lucide-react";
import {
  adminAssignToProjectAction,
  adminUnassignFromProjectAction,
} from "@/lib/server-actions/admin/projects";

type StaffOption = { id: string; name: string };
type Assignment = { userId: string; name: string };

export function ProjectTeamManager({
  orgId,
  projectId,
  initialAssignments,
  staffOptions,
}: {
  orgId: string;
  projectId: string;
  initialAssignments: Assignment[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerValue, setPickerValue] = useState<string>("");

  const assignedIds = new Set(initialAssignments.map((a) => a.userId));
  const availableOptions = staffOptions.filter((o) => !assignedIds.has(o.id));

  function onAssign(userId: string) {
    setError(null);
    startTransition(async () => {
      const r = await adminAssignToProjectAction(orgId, { projectId, userId });
      if (!r.ok) setError(r.error.message);
      setPickerValue("");
      router.refresh();
    });
  }

  function onUnassign(userId: string) {
    setError(null);
    startTransition(async () => {
      const r = await adminUnassignFromProjectAction(orgId, { projectId, userId });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {initialAssignments.length === 0 ? (
        <p className="text-sm text-slate-500">No one assigned yet.</p>
      ) : (
        <ul className="space-y-1">
          {initialAssignments.map((a) => (
            <li
              key={a.userId}
              className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm"
            >
              <span>{a.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onUnassign(a.userId)}
                aria-label={`Unassign ${a.name}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {availableOptions.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            value={pickerValue}
            onValueChange={(v) => v && onAssign(v)}
            disabled={pending}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Assign someone…" />
            </SelectTrigger>
            <SelectContent>
              {availableOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Page**

Create `app/admin/orgs/[orgId]/projects/[projectId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import { adminListOrgMembersAction } from "@/lib/server-actions/admin/users";
import { adminListTasksAction } from "@/lib/server-actions/admin/tasks";
import { adminListNotificationsAction } from "@/lib/server-actions/admin/notifications";
import { ProjectTeamManager } from "@/components/app/project-team-manager";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const TASK_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  todo: "outline",
  in_progress: "default",
  blocked: "destructive",
  done: "secondary",
  cancelled: "secondary",
};

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const { orgId, projectId } = await params;
  const projectR = await adminGetProjectAction(orgId, projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found" || projectR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [tasksR, membersR] = await Promise.all([
    adminListTasksAction(orgId, { projectId }),
    adminListOrgMembersAction(orgId, {}),
  ]);
  const tasks = tasksR.ok ? tasksR.data : [];

  // Read current project assignments via direct DB (no service helper for this list yet).
  const assignmentRows = await db
    .select({
      userId: schema.projectAssignments.userId,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.projectAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.projectAssignments.userId))
    .where(eq(schema.projectAssignments.projectId, projectId));
  const assignments = assignmentRows.map((r) => ({
    userId: r.userId,
    name: r.name ?? r.email,
  }));

  // Staff candidate list: org members with systemRole employee or admin.
  const members = membersR.ok ? membersR.data : [];
  const staffOptions = members
    .filter((m) => m.systemRole === "employee" || m.systemRole === "admin")
    .map((m) => ({ id: m.id, name: m.name ?? m.email }));

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-600 capitalize">
            {project.serviceType.replace(/_/g, " ")}
          </p>
          {project.description && (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm text-slate-700">
              {project.description}
            </p>
          )}
        </div>
        <Badge variant="secondary" className="capitalize">
          {project.status}
        </Badge>
      </header>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Team</h2>
        <ProjectTeamManager
          orgId={orgId}
          projectId={projectId}
          initialAssignments={assignments}
          staffOptions={staffOptions}
        />
      </section>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Tasks</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <Badge variant={TASK_STATUS_VARIANT[t.status] ?? "outline"} className="text-xs">
                        {TASK_STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                      {t.dueDate && <span>Due {format(new Date(t.dueDate), "MMM d")}</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

The `adminListNotificationsAction` import on line 12 is unused above — DELETE that import. (I'm being explicit because the agent will copy this code as-is; do not include unused imports.)

Final clean import block (replace the whole import block above with this):

```tsx
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import { adminListOrgMembersAction } from "@/lib/server-actions/admin/users";
import { adminListTasksAction } from "@/lib/server-actions/admin/tasks";
import { ProjectTeamManager } from "@/components/app/project-team-manager";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
```

(Drop `Link` and `adminListNotificationsAction` since they aren't used in the rendered page above.)

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/project-team-manager.tsx "app/admin/orgs/[orgId]/projects/[projectId]"
git commit -m "feat(admin): project detail with team manager (assign/unassign) + tasks list"
```

---

### Task 7: Work request review queue

**Files:**
- Create: `app/admin/orgs/[orgId]/work-requests/page.tsx`

A list of work requests with `?status=submitted|accepted|rejected|duplicate|all` filter pills. Each row links to the detail page.

- [ ] **Step 1: Implement**

```tsx
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "default",
  accepted: "secondary",
  rejected: "destructive",
  duplicate: "outline",
};

const FILTERS = ["all", "submitted", "accepted", "rejected", "duplicate"] as const;

type FilterValue = typeof FILTERS[number];

export default async function AdminWorkRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId } = await params;
  const { status: statusParam } = await searchParams;
  const filter: FilterValue = (FILTERS as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as FilterValue)
    : "submitted";

  const serviceFilter = filter === "all" ? {} : { status: filter as "submitted" | "accepted" | "rejected" | "duplicate" };
  const r = await adminListWorkRequestsAction(orgId, serviceFilter);
  const requests = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Work requests</h1>

      <div className="flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/admin/orgs/${orgId}/work-requests?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              filter === f ? "border-blue-500 bg-blue-50 text-blue-700" : "hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-slate-500">No requests match.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/orgs/${orgId}/work-requests/${req.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {req.title}
                  </Link>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {format(new Date(req.submittedAt), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[req.status] ?? "outline"} className="text-xs">
                  {STATUS_LABELS[req.status] ?? req.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add "app/admin/orgs/[orgId]/work-requests/page.tsx"
git commit -m "feat(admin): work-request review queue with status filter pills"
```

---

### Task 8: Work request detail with accept / reject / mark-duplicate

**Files:**
- Create: `components/app/work-request-review-bar.tsx` (`"use client"`)
- Create: `app/admin/orgs/[orgId]/work-requests/[requestId]/page.tsx`

The review bar lets admin: pick a project (optional, for accept), accept, or reject (with reason), or mark duplicate (with canonical task id). Each button is disabled if the request isn't `submitted`.

- [ ] **Step 1: WorkRequestReviewBar (client)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  adminAcceptWorkRequestAction,
  adminRejectWorkRequestAction,
  adminMarkDuplicateWorkRequestAction,
} from "@/lib/server-actions/admin/work-requests";

type ProjectOption = { id: string; name: string };

export function WorkRequestReviewBar({
  orgId,
  requestId,
  initialStatus,
  projects,
}: {
  orgId: string;
  requestId: string;
  initialStatus: string;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acceptProjectId, setAcceptProjectId] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [duplicateTaskId, setDuplicateTaskId] = useState<string>("");

  const disabled = initialStatus !== "submitted" || pending;

  function onAccept() {
    setError(null);
    startTransition(async () => {
      const r = await adminAcceptWorkRequestAction(orgId, {
        id: requestId,
        projectId: acceptProjectId || undefined,
      });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  function onReject() {
    setError(null);
    if (!rejectReason.trim()) {
      setError("A reason is required to reject.");
      return;
    }
    startTransition(async () => {
      const r = await adminRejectWorkRequestAction(orgId, {
        id: requestId,
        reason: rejectReason,
      });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  function onMarkDuplicate() {
    setError(null);
    if (!duplicateTaskId.trim()) {
      setError("A canonical task id is required to mark duplicate.");
      return;
    }
    startTransition(async () => {
      const r = await adminMarkDuplicateWorkRequestAction(orgId, {
        id: requestId,
        canonicalTaskId: duplicateTaskId,
      });
      if (!r.ok) setError(r.error.message);
      router.refresh();
    });
  }

  if (initialStatus !== "submitted") {
    return (
      <p className="text-sm text-slate-500">
        Already {initialStatus}. No further action available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-medium">Accept</h3>
          <div className="space-y-2">
            <Label htmlFor="acceptProject">Assign to project (optional)</Label>
            <Select
              value={acceptProjectId}
              onValueChange={(v) => v && setAcceptProjectId(v)}
            >
              <SelectTrigger id="acceptProject">
                <SelectValue placeholder="(leave unassigned)" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={onAccept} disabled={disabled}>
            {pending ? "Accepting…" : "Accept request"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-medium">Reject</h3>
          <div className="space-y-2">
            <Label htmlFor="rejectReason">Reason</Label>
            <Textarea
              id="rejectReason"
              rows={3}
              maxLength={2000}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <Button type="button" variant="destructive" onClick={onReject} disabled={disabled}>
            {pending ? "Rejecting…" : "Reject request"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-medium">Mark as duplicate</h3>
          <div className="space-y-2">
            <Label htmlFor="duplicateTaskId">Canonical task id</Label>
            <Input
              id="duplicateTaskId"
              value={duplicateTaskId}
              onChange={(e) => setDuplicateTaskId(e.target.value)}
              placeholder="task-id of the canonical request/task"
            />
          </div>
          <Button type="button" variant="outline" onClick={onMarkDuplicate} disabled={disabled}>
            {pending ? "Marking…" : "Mark duplicate"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Page**

Create `app/admin/orgs/[orgId]/work-requests/[requestId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { adminGetWorkRequestAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";
import { WorkRequestReviewBar } from "@/components/app/work-request-review-bar";

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "default",
  accepted: "secondary",
  rejected: "destructive",
  duplicate: "outline",
};

export default async function AdminWorkRequestDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; requestId: string }>;
}) {
  const { orgId, requestId } = await params;
  const r = await adminGetWorkRequestAction(orgId, requestId);
  if (!r.ok) {
    if (r.error.code === "not_found" || r.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{r.error.message}</p>;
  }
  const req = r.data;

  const projectsR = await adminListProjectsAction(orgId, { status: "active" });
  const projects = projectsR.ok ? projectsR.data.map((p) => ({ id: p.id, name: p.name })) : [];

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs">
          <Badge variant={STATUS_VARIANT[req.status] ?? "outline"}>
            {STATUS_LABELS[req.status] ?? req.status}
          </Badge>
          {req.priorityHint && (
            <Badge variant="outline">
              Priority: {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint}
            </Badge>
          )}
          <span className="text-slate-500">
            Submitted {format(new Date(req.submittedAt), "MMM d, yyyy h:mm a")}
          </span>
        </div>
        <h1 className="text-xl font-semibold">{req.title}</h1>
      </header>

      {req.description && (
        <div className="rounded-md border bg-white p-4">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{req.description}</p>
        </div>
      )}

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Review</h2>
        <WorkRequestReviewBar
          orgId={orgId}
          requestId={requestId}
          initialStatus={req.status}
          projects={projects}
        />
      </section>
    </article>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/work-request-review-bar.tsx "app/admin/orgs/[orgId]/work-requests/[requestId]"
git commit -m "feat(admin): work-request detail with accept/reject/mark-duplicate review bar"
```

---

### Task 9: Admin notifications page

**Files:**
- Create: `components/app/admin-notifications-list.tsx`
- Create: `app/admin/orgs/[orgId]/notifications/page.tsx`

Same shape as the customer/employee variants but with admin-side deep links.

- [ ] **Step 1: AdminNotificationsList (client)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminMarkNotificationsReadAction } from "@/lib/server-actions/admin/notifications";

type Notification = {
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  relatedType: string | null;
  relatedId: string | null;
  readAt: Date | string | null;
  createdAt: Date | string;
};

const EVENT_LABELS: Record<string, string> = {
  "daily_update.posted": "New daily update",
  "comment.posted": "New comment",
  "work_request.submitted": "Work request submitted",
  "work_request.status_changed": "Work request status changed",
  "task.assigned": "Task assigned",
  "task.status_changed": "Task status changed",
};

function relatedHref(orgId: string, n: Notification): string | null {
  if (n.relatedType === "work_request" && n.relatedId) {
    return `/admin/orgs/${orgId}/work-requests/${n.relatedId}`;
  }
  if (n.relatedType === "task" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  if (n.relatedType === "daily_update" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  if (n.relatedType === "comment" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/admin/orgs/${orgId}/projects/${projectId}`;
  }
  return null;
}

export function AdminNotificationsList({
  orgId,
  initial,
}: {
  orgId: string;
  initial: Notification[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items] = useState(initial);

  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);

  function handleMarkAll() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await adminMarkNotificationsReadAction(orgId, { ids: unreadIds });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{unreadIds.length} unread</p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAll}
          disabled={pending || unreadIds.length === 0}
        >
          {pending ? "Marking…" : "Mark all as read"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No notifications.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const href = relatedHref(orgId, n);
            const label = EVENT_LABELS[n.eventType] ?? n.eventType;
            const inner = (
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-medium">{label}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {format(new Date(n.createdAt), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
                {!n.readAt && (
                  <span
                    className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-500"
                    aria-label="Unread"
                  />
                )}
              </CardContent>
            );
            return (
              <Card key={n.id} className={n.readAt ? "" : "border-blue-300"}>
                {href ? (
                  <Link href={href} className="block">
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Page**

Create `app/admin/orgs/[orgId]/notifications/page.tsx`:

```tsx
import { adminListNotificationsAction } from "@/lib/server-actions/admin/notifications";
import { AdminNotificationsList } from "@/components/app/admin-notifications-list";

export default async function AdminNotificationsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const r = await adminListNotificationsAction(orgId, {});
  const initial = r.ok
    ? r.data.notifications.map((n) => ({ ...n, payload: n.payload as Record<string, unknown> }))
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <AdminNotificationsList orgId={orgId} initial={initial} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/admin-notifications-list.tsx "app/admin/orgs/[orgId]/notifications"
git commit -m "feat(admin): notifications page with admin-specific deep links"
```

---

### Task 10: Playwright E2E (admin accepts a work request)

**Files:**
- Modify: `tests/e2e/fixtures/seed.ts` (add a submitted work request from the customer)
- Create: `tests/e2e/admin-accept-request.spec.ts`

The seed already creates project + employee assignment + task. For this test we ALSO need a submitted work request from the customer. Add that to `seedTestUsers()`.

- [ ] **Step 1: Extend seed with a work request**

Modify `tests/e2e/fixtures/seed.ts`. After the task creation block (which returns `{ password, projectId, taskId }`), insert (BEFORE the final return) a work request creation:

```ts
  // Customer-submitted work request, in 'submitted' state.
  const customerRow = await exec("SELECT id FROM users WHERE email = 'customer@e2e.test'");
  const customerId2 = (customerRow.rows[0] as { id: string }).id;
  const requestRes = await exec(
    `INSERT INTO work_requests (org_id, title, description, status, submitted_by)
     VALUES ($1, 'E2E request to accept', 'Please make this thing happen', 'submitted', $2)
     RETURNING id`,
    [orgId, customerId2],
  );
  const workRequestId = (requestRes.rows[0] as { id: string }).id;

  return { password: TEST_PASSWORD, projectId, taskId, workRequestId };
```

Replace the prior `return { password: TEST_PASSWORD, projectId, taskId };` with this new return statement.

Also extend `cleanupTestData` to handle work requests (it already does, but ensure ordering is right with the new schema). Verify the existing cleanup deletes work_requests after tasks (it already does — we already DELETE FROM tasks BEFORE work_requests). Just confirm by reading the existing file.

- [ ] **Step 2: Test**

Create `tests/e2e/admin-accept-request.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("admin accepts a work request and a task is created", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "admin@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');

  // After sign-in, /admin/dashboard redirects to /admin/orgs/<id>/dashboard.
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/dashboard$/, { timeout: 15_000 });

  // Navigate to work requests (filter defaults to 'submitted').
  await page.click('a:has-text("Work requests")');
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/work-requests/);

  // Open the seeded request.
  await page.click('a:has-text("E2E request to accept")');
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/work-requests\/[^/]+$/);

  // Click "Accept request" (no project selected — task will be created stand-alone).
  await page.click('button:has-text("Accept request")');

  // The page refreshes and the review bar shows "Already accepted."
  await expect(page.getByText(/Already accepted/i)).toBeVisible({ timeout: 10_000 });
});
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test:e2e
```

Expected: 6 prior + 1 new = 7 passing.

```bash
git add tests/e2e/fixtures/seed.ts tests/e2e/admin-accept-request.spec.ts
git commit -m "test(e2e): admin accepts a work request end-to-end + seed extends with submitted request"
```

---

### Task 11: Final verification + branch wrap

- [ ] **Step 1: Full sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

All clean. Test counts: 214 vitest + 7 Playwright E2E.

- [ ] **Step 2: Manual smoke (optional)**

```bash
pnpm dev
```

Sign in as `admin@e2e.test` / `Passw0rd!Test123`. Click through:
- After login → redirected to `/admin/orgs/<id>/dashboard`
- Dashboard shows pending count (1) and active project count (1)
- Projects list shows "E2E project"
- "+ New project" form renders → can create
- Project detail shows team manager + tasks
- Work requests queue shows the seeded request
- Detail page → can Accept / Reject / Mark duplicate
- Notifications page works

- [ ] **Step 3: Hand off**

The branch `feat/phase-1-admin-ui` is ready for merge into `main`.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`):

- §1 admin manages projects + reviews requests + assigns staff — Tasks 4 (list), 5 (create), 6 (assign), 7 (queue), 8 (review) ✓
- §2 admin scope (full project CRUD, work request review, team management) — Tasks 1-9 ✓
- §8.1 project create — Task 5 ✓
- §8.4 work request triage — Tasks 7-8 ✓
- §8.5 accept work request → creates task — Task 8 (UI) + existing service (Plan 2b) ✓
- §8.6 reject with reason — Task 8 ✓
- §8.7 mark duplicate — Task 8 ✓
- §9.3 in-app notifications — Task 9 ✓ (NotificationsBell reused via `href` prop from Plan 3b)

**Out of scope (deliberately):**
- Project edit form — Service supports it (Plan 2a) but Phase 1 admin UI omits it; admins archive via direct DB edit if needed (Phase 2 enhancement)
- User invite flow — Service exists (`inviteUser` in Plan 2c) but UI is deferred to Plan 4 (cross-cutting)
- Cross-org data views — Phase 1 is single-org-at-a-time; multi-org cross views are Phase 2
- Admin task creation (standalone tasks not from work requests) — Service supports it (`createTask`) but no UI; admins create tasks via accept-work-request flow only
- Admin daily-update / time-entry CRUD — view-only via existing pages; admin doesn't post updates or log time directly

**Placeholder scan:** None — every step has full code.

**Type consistency:**
- All admin Server Action wrappers take `orgId: string` as the first parameter and pass it as `staffOrgId`.
- The `adminListOrgsAction` is the single exception — it does NOT take orgId and does its own role check inline (since admins without a picked org cannot construct an OrgContext through `withSessionContext`).
- The `cn(buttonVariants())` pattern is used everywhere; no `Button asChild`.
- `<Select>` `onValueChange` uses null guards `(v) => v && setX(v)` (consistent with Plan 3a/3b).
- `Alert` uses `variant="destructive"` for error states (lesson learned from Plan 3b reviews).

**Architectural decisions baked in:**
- URL is `/admin/orgs/[orgId]/...`. Top-level `/admin/dashboard` redirects to first org. `/admin/orgs` lists all orgs.
- Admin doesn't poll for unread notifications (the bell still uses the customer-side `listNotificationsAction` which has no orgId). Polling will pick up notifications visible to the customer-side wrapper from any org the user can access; for admin (which has no membership) this means the poll always returns 0. The initial unread count on each page load via `adminListNotificationsAction(orgId, ...)` is correct. Fixing live polling for admin is a follow-up.
- `ProjectTeamManager` reads current assignments by querying the DB directly (no service helper for "list assignments by project"). This matches the service-layer pattern of "read state via direct queries when no list service exists" used in customer/employee pages.
- Per-org admin pages live under `app/admin/orgs/[orgId]/...`. The non-org `/admin/dashboard` only exists as a redirect target.
