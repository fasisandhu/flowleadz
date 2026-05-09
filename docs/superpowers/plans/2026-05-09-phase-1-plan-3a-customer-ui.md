# Phase 1 — Plan 3a: Customer UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the customer-facing dashboard and feature pages — landing/dashboard, projects list + detail, daily updates feed (read + comment), work requests (submit / list / detail), notifications. All pages are Server Components fetching data via Server Action wrappers around the now-complete service layer (Plans 2a/2b/2c).

**Architecture:** A new `lib/server-actions/` layer wraps each service-layer function. Server Actions own session lookup (`auth.api.getSession`) + `OrgContext` building (`buildOrgContext`) and delegate the actual work to `lib/services/<feature>`. ESLint's `no-restricted-imports` is extended to allow `lib/server-actions/**` to import `@/lib/db/client`. Pages are Server Components by default; only forms + interactive bits are `"use client"`. Forms use react-hook-form + zod (re-exported from each service's `schemas.ts`). Notifications bell polls `/api/auth`-equivalent action every 30s per spec §9.3.

**Tech Stack:** Next.js 15 App Router, Server Actions, react-hook-form + @hookform/resolvers, Zod, shadcn/ui (already installed in Plan 1), lucide-react icons.

**Branch:** Implement on `feat/phase-1-customer-ui`, branched from `main`. Last main commit at start: the Plan-2c merge (`735a10b`).

---

## File structure created by this plan

```
lib/server-actions/
  _action.ts                      (withSessionContext helper)
  projects.ts
  daily-updates.ts
  comments.ts
  work-requests.ts
  notifications.ts
  attachments.ts                  (used by customer + employee + admin)

app/customer/
  layout.tsx                      (REPLACED — nav + bell + logout)
  dashboard/page.tsx              (REPLACED — compose projects + updates + tasks + CTA)
  projects/
    page.tsx
    [projectId]/
      page.tsx
      updates/
        [updateId]/page.tsx       (with comments thread)
  requests/
    page.tsx
    new/page.tsx
    [requestId]/page.tsx
  notifications/page.tsx

components/app/
  notifications-bell.tsx          ("use client" — polls every 30s)
  comment-thread.tsx              (renders comments + post-reply form)
  comment-reply-form.tsx          ("use client")
  work-request-form.tsx           ("use client")
  daily-update-card.tsx           (server component, used by feeds)
  task-list-item.tsx              (server component)

eslint.config.mjs                 (override extended for lib/server-actions/**)
```

---

## Tasks

### Task 1: Server Actions infrastructure

**Files:**
- Modify: `eslint.config.mjs` (extend boundary override)
- Create: `lib/server-actions/_action.ts`

`_action.ts` exports `withSessionContext` — a helper that wraps a service-layer call with session lookup + OrgContext building. Server Actions delegate to it so each one stays a 1-2-line wrapper.

- [ ] **Step 1: Extend ESLint override**

Edit `eslint.config.mjs`. Find the override block:

```js
{
  files: [
    "lib/services/**",
    "lib/db/**",
    "lib/better-auth/**",
    "tests/fixtures/**",
    "tests/integration/**",
    "tests/unit/**",
  ],
  rules: { "no-restricted-imports": "off" },
},
```

Add `"lib/server-actions/**"` to the files array.

- [ ] **Step 2: Write the helper**

Create `lib/server-actions/_action.ts`:

```ts
import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { db } from "@/lib/db/client";
import { buildOrgContext } from "@/lib/services/_auth/build-context";
import { err, type Result, type AppError } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import type { Db } from "@/lib/db/client";

/**
 * Wraps a service-layer call with session lookup + OrgContext building.
 * Customers always have orgId = membership org. Staff use the orgId encoded in
 * their currently-active route (passed in via the `orgId` arg, defaulting to
 * the staff user's "current" org via a header set by the active-org switcher).
 *
 * Usage from a Server Action:
 *
 *     export async function listMyProjects() {
 *       return withSessionContext((db, ctx) => listProjects(db, ctx, {}));
 *     }
 */
export async function withSessionContext<T>(
  fn: (db: Db, ctx: OrgContext) => Promise<Result<T, AppError>>,
  options?: { staffOrgId?: string },
): Promise<Result<T, AppError>> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return err("unauthorized", "Not signed in");
  }
  const ctx = await buildOrgContext(db, {
    userId: session.user.id,
    orgId: options?.staffOrgId,
  });
  if (!ctx) {
    return err("unauthorized", "No organization context — invalid role/membership");
  }
  return fn(db, ctx);
}
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm lint && pnpm build
```
All must pass.

- [ ] **Step 4: Commit**

```bash
git checkout -b feat/phase-1-customer-ui
git add eslint.config.mjs lib/server-actions/_action.ts
git commit -m "feat(server-actions): withSessionContext wrapper + boundary override"
```

---

### Task 2: Server Action wrappers (projects, daily-updates, comments, work-requests, notifications, attachments)

**Files:**
- Create: `lib/server-actions/projects.ts`, `daily-updates.ts`, `comments.ts`, `work-requests.ts`, `notifications.ts`, `attachments.ts`

Each file is a thin set of `"use server"` wrappers around the corresponding service. No tests for these files directly — covered by service-layer tests via the wrapped functions.

- [ ] **Step 1: projects wrappers**

Create `lib/server-actions/projects.ts`:

```ts
"use server";

import { withSessionContext } from "./_action";
import * as projects from "@/lib/services/projects";

export async function listProjectsAction(input: projects.ListProjectsInput = {}) {
  return withSessionContext((db, ctx) => projects.listProjects(db, ctx, input));
}

export async function getProjectAction(projectId: string) {
  return withSessionContext((db, ctx) => projects.getProject(db, ctx, projectId));
}
```

- [ ] **Step 2: daily-updates wrappers**

Create `lib/server-actions/daily-updates.ts`:

```ts
"use server";

import { withSessionContext } from "./_action";
import * as dailyUpdates from "@/lib/services/daily-updates";

export async function listDailyUpdatesAction(input: dailyUpdates.ListDailyUpdatesInput = {}) {
  return withSessionContext((db, ctx) => dailyUpdates.listDailyUpdates(db, ctx, input));
}

export async function getDailyUpdateAction(id: string) {
  return withSessionContext((db, ctx) => dailyUpdates.getDailyUpdate(db, ctx, id));
}

export async function listDailyUpdateRevisionsAction(id: string) {
  return withSessionContext((db, ctx) => dailyUpdates.listDailyUpdateRevisions(db, ctx, id));
}
```

- [ ] **Step 3: comments wrappers**

Create `lib/server-actions/comments.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as comments from "@/lib/services/comments";

export async function createCommentAction(input: comments.CreateCommentInput) {
  const result = await withSessionContext((db, ctx) => comments.createComment(db, ctx, input));
  if (result.ok) {
    // Refresh the daily-update detail page so the new comment shows immediately.
    revalidatePath(`/customer/projects/.+/updates/${input.dailyUpdateId}`, "page");
  }
  return result;
}

export async function listCommentsAction(dailyUpdateId: string) {
  return withSessionContext((db, ctx) => comments.listComments(db, ctx, dailyUpdateId));
}

export async function softDeleteCommentAction(input: comments.SoftDeleteCommentInput) {
  const result = await withSessionContext((db, ctx) => comments.softDeleteComment(db, ctx, input));
  return result;
}
```

- [ ] **Step 4: work-requests wrappers**

Create `lib/server-actions/work-requests.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as workRequests from "@/lib/services/work-requests";

export async function submitWorkRequestAction(input: workRequests.SubmitWorkRequestInput) {
  const result = await withSessionContext((db, ctx) => workRequests.submitWorkRequest(db, ctx, input));
  if (result.ok) revalidatePath("/customer/requests", "page");
  return result;
}

export async function listWorkRequestsAction(input: workRequests.ListWorkRequestsInput = {}) {
  return withSessionContext((db, ctx) => workRequests.listWorkRequests(db, ctx, input));
}

export async function getWorkRequestAction(id: string) {
  return withSessionContext((db, ctx) => workRequests.getWorkRequest(db, ctx, id));
}
```

- [ ] **Step 5: notifications wrappers**

Create `lib/server-actions/notifications.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as notifications from "@/lib/services/notifications";

export async function listNotificationsAction(input: notifications.ListForUserInput = {}) {
  return withSessionContext((db, ctx) => notifications.listForUser(db, ctx, input));
}

export async function markNotificationsReadAction(input: notifications.MarkReadInput) {
  const result = await withSessionContext((db, ctx) => notifications.markRead(db, ctx, input));
  if (result.ok) revalidatePath("/customer/notifications", "page");
  return result;
}

export async function upsertNotificationPreferenceAction(input: notifications.UpsertPreferenceInput) {
  return withSessionContext((db, ctx) => notifications.upsertPreference(db, ctx, input));
}
```

- [ ] **Step 6: attachments wrappers**

Create `lib/server-actions/attachments.ts`:

```ts
"use server";

import { withSessionContext } from "./_action";
import * as attachments from "@/lib/services/attachments";

export async function getUploadUrlAction(input: attachments.GetUploadUrlInput) {
  return withSessionContext((db, ctx) => attachments.getUploadUrl(db, ctx, input));
}

export async function confirmAttachmentAction(input: attachments.ConfirmAttachmentInput) {
  return withSessionContext((db, ctx) => attachments.confirm(db, ctx, input));
}

export async function listAttachmentsForParentAction(input: attachments.ListForParentInput) {
  return withSessionContext((db, ctx) => attachments.listForParent(db, ctx, input));
}
```

Note: services don't currently re-export their input types from the public `index.ts`. If `pnpm typecheck` complains that `projects.ListProjectsInput` doesn't exist as a type, edit each `lib/services/<feature>/index.ts` to add the missing re-exports:

```ts
export type {
  ListProjectsInput,
  CreateProjectInput,
  UpdateProjectInput,
  AssignmentInput,
} from "./schemas";
```

Do the same for the other features as needed.

- [ ] **Step 7: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add lib/server-actions lib/services
git commit -m "feat(server-actions): wrappers for projects/updates/comments/requests/notifications/attachments"
```

---

### Task 3: Customer layout — nav + bell + logout

**Files:**
- Replace: `app/customer/layout.tsx`
- Create: `components/app/notifications-bell.tsx`

The customer layout has a fixed top header with: app name (left), nav links (Dashboard / Projects / Requests), notifications bell (with unread count, polls every 30s), user menu (display name + sign out).

- [ ] **Step 1: NotificationsBell client component**

Create `components/app/notifications-bell.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listNotificationsAction } from "@/lib/server-actions/notifications";

const POLL_INTERVAL_MS = 30_000;

export function NotificationsBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [unread, setUnread] = useState(initialUnreadCount);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const r = await listNotificationsAction({ filter: "unread", limit: 1 });
      if (!cancelled && r.ok) setUnread(r.data.unreadCount);
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/customer/notifications"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      className="relative inline-flex items-center justify-center rounded-md p-2 hover:bg-slate-100"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs"
        >
          {unread > 99 ? "99+" : unread}
        </Badge>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Customer layout**

Replace `app/customer/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/better-auth/config";
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { NotificationsBell } from "@/components/app/notifications-bell";

async function signOutAction() {
  "use server";
  const { redirect } = await import("next/navigation");
  const { headers } = await import("next/headers");
  const { auth } = await import("@/lib/better-auth/config");
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const notifs = await listNotificationsAction({ filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/customer/dashboard" className="font-semibold">
              Marketing CRM
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/customer/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <Link href="/customer/projects" className="hover:underline">
                Projects
              </Link>
              <Link href="/customer/requests" className="hover:underline">
                Requests
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell initialUnreadCount={initialUnread} />
            <span className="text-sm text-slate-600">{session.user.name ?? session.user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-sm text-slate-600 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add app/customer/layout.tsx components/app/notifications-bell.tsx
git commit -m "feat(customer): top-nav layout with notifications bell + sign out"
```

---

### Task 4: Customer dashboard page

**Files:**
- Replace: `app/customer/dashboard/page.tsx`
- Create: `components/app/daily-update-card.tsx`
- Create: `components/app/task-list-item.tsx`

Composes:
1. Active projects (top 3) — from `listProjectsAction({ status: 'active' })`
2. Recent daily updates (top 5 across all customer-visible projects) — `listDailyUpdatesAction({})`
3. Upcoming tasks (top 5 customer_visible, status in todo/in_progress/blocked) — `listTasksAction({ status filter? })` — note: tasks server-action wrapper not yet built; we'll use the daily-updates feed instead for Phase 1 customer dashboard, since the spec only calls for "upcoming tasks" but staff manage them. For Phase 1 we render upcoming tasks via the project tab; the dashboard skips that section.

Actually we DO want upcoming tasks on the customer dashboard per spec §1. Add a tasks server-action wrapper as part of this task.

- [ ] **Step 1: Tasks Server Action wrappers**

Create/extend `lib/server-actions/tasks.ts`:

```ts
"use server";

import { withSessionContext } from "./_action";
import * as tasks from "@/lib/services/tasks";

export async function listTasksAction(input: tasks.ListTasksInput = {}) {
  return withSessionContext((db, ctx) => tasks.listTasks(db, ctx, input));
}

export async function getTaskAction(id: string) {
  return withSessionContext((db, ctx) => tasks.getTask(db, ctx, id));
}
```

(Make sure `lib/services/tasks/index.ts` re-exports `ListTasksInput` from its `schemas.ts`.)

- [ ] **Step 2: DailyUpdateCard component**

Create `components/app/daily-update-card.tsx`:

```tsx
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Update = {
  id: string;
  projectId: string;
  body: string;
  activityType: string;
  visibility: string;
  logDate: string;
  createdAt: Date | string;
};

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

export function DailyUpdateCard({
  update,
  hrefBase = "/customer/projects",
}: {
  update: Update;
  hrefBase?: string;
}) {
  const href = `${hrefBase}/${update.projectId}/updates/${update.id}`;
  const logDateLabel = format(new Date(update.logDate), "MMM d, yyyy");
  const preview = update.body.length > 200 ? `${update.body.slice(0, 200)}…` : update.body;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{ACTIVITY_LABELS[update.activityType] ?? update.activityType}</Badge>
          <CardDescription className="text-xs">{logDateLabel}</CardDescription>
        </div>
        <Link href={href} className="text-sm text-blue-600 hover:underline">
          Open
        </Link>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{preview}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: TaskListItem component**

Create `components/app/task-list-item.tsx`:

```tsx
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  todo: "outline",
  in_progress: "default",
  blocked: "destructive",
  done: "secondary",
  cancelled: "secondary",
};

export function TaskListItem({ task }: { task: Task }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-white p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{task.title}</div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          <Badge variant={STATUS_VARIANT[task.status] ?? "outline"} className="text-xs">
            {STATUS_LABELS[task.status] ?? task.status}
          </Badge>
          {task.dueDate && <span>Due {format(new Date(task.dueDate), "MMM d")}</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Dashboard page**

Replace `app/customer/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listProjectsAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskListItem } from "@/components/app/task-list-item";

export default async function CustomerDashboardPage() {
  const [projectsR, updatesR, tasksR] = await Promise.all([
    listProjectsAction({ status: "active" }),
    listDailyUpdatesAction({}),
    listTasksAction({}),
  ]);

  const activeProjects = projectsR.ok ? projectsR.data.slice(0, 3) : [];
  const recentUpdates = updatesR.ok ? updatesR.data.slice(0, 5) : [];
  const upcomingTasks = tasksR.ok
    ? tasksR.data
        .filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button asChild>
          <Link href="/customer/requests/new">
            <Plus className="mr-2 h-4 w-4" />
            New work request
          </Link>
        </Button>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Active projects</h2>
          <Link href="/customer/projects" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {activeProjects.length === 0 ? (
          <p className="text-sm text-slate-500">No active projects yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {activeProjects.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  <div className="mb-1 capitalize">{p.serviceType.replace("_", " ")}</div>
                  <Link
                    href={`/customer/projects/${p.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Open project →
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Recent updates</h2>
        </div>
        {recentUpdates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {recentUpdates.map((u) => (
              <DailyUpdateCard key={u.id} update={u} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Upcoming tasks</h2>
        {upcomingTasks.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on deck.</p>
        ) : (
          <div className="space-y-2">
            {upcomingTasks.map((t) => (
              <TaskListItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Install date-fns** (used by the cards)

```bash
pnpm add date-fns
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add app/customer/dashboard/page.tsx components/app/daily-update-card.tsx components/app/task-list-item.tsx lib/server-actions/tasks.ts lib/services/tasks package.json pnpm-lock.yaml
git commit -m "feat(customer): dashboard composing projects + recent updates + upcoming tasks"
```

---

### Task 5: Customer projects list page

**Files:**
- Create: `app/customer/projects/page.tsx`

- [ ] **Step 1: Implement**

Create `app/customer/projects/page.tsx`:

```tsx
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listProjectsAction } from "@/lib/server-actions/projects";

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

export default async function CustomerProjectsPage() {
  const r = await listProjectsAction({});
  const projects = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Projects</h1>

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">No projects yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link
                      href={`/customer/projects/${p.id}`}
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
pnpm typecheck && pnpm lint && pnpm build
git add app/customer/projects/page.tsx
git commit -m "feat(customer): projects list page"
```

---

### Task 6: Customer project detail page (with updates feed inline)

**Files:**
- Create: `app/customer/projects/[projectId]/page.tsx`

Project detail shows project metadata, an updates feed (recent daily updates for THIS project), and an upcoming-tasks list for this project.

- [ ] **Step 1: Implement**

Create `app/customer/projects/[projectId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskListItem } from "@/components/app/task-list-item";

export default async function CustomerProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [updatesR, tasksR] = await Promise.all([
    listDailyUpdatesAction({ projectId }),
    listTasksAction({ projectId }),
  ]);

  const updates = updatesR.ok ? updatesR.data : [];
  const upcomingTasks = tasksR.ok
    ? tasksR.data.filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
    : [];

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="mt-1 text-sm text-slate-600 capitalize">
            {project.serviceType.replace("_", " ")}
          </p>
          {project.description && (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm text-slate-700">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <Badge variant="secondary" className="capitalize">
            {project.status}
          </Badge>
          {project.startDate && (
            <span className="text-xs text-slate-500">
              Started {format(new Date(project.startDate), "MMM d, yyyy")}
            </span>
          )}
        </div>
      </header>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Updates</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <DailyUpdateCard key={u.id} update={u} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Upcoming tasks</h2>
        {upcomingTasks.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on deck.</p>
        ) : (
          <Card>
            <CardContent className="space-y-2 p-4">
              {upcomingTasks.map((t) => (
                <TaskListItem key={t.id} task={t} />
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add app/customer/projects/[projectId]/page.tsx
git commit -m "feat(customer): project detail with updates feed + upcoming tasks"
```

---

### Task 7: Customer daily update detail page (with comments thread)

**Files:**
- Create: `app/customer/projects/[projectId]/updates/[updateId]/page.tsx`
- Create: `components/app/comment-thread.tsx`
- Create: `components/app/comment-reply-form.tsx`

The page renders the update body + activity badge + log date. Below it: a comment thread with chronological comments, each showing author + timestamp + body (or "[deleted]" for soft-deleted), followed by a reply form.

- [ ] **Step 1: CommentReplyForm (client)**

Create `components/app/comment-reply-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCommentAction } from "@/lib/server-actions/comments";

export function CommentReplyForm({ dailyUpdateId }: { dailyUpdateId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const r = await createCommentAction({ dailyUpdateId, body });
    setPending(false);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Textarea
        placeholder="Reply…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        required
        minLength={1}
        maxLength={10000}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}
```

The `Textarea` component isn't yet installed via shadcn. Add it:

```bash
pnpm dlx shadcn@latest add textarea
```

- [ ] **Step 2: CommentThread (server component)**

Create `components/app/comment-thread.tsx`:

```tsx
import { format } from "date-fns";
import { listCommentsAction } from "@/lib/server-actions/comments";
import { CommentReplyForm } from "./comment-reply-form";

export async function CommentThread({ dailyUpdateId }: { dailyUpdateId: string }) {
  const r = await listCommentsAction(dailyUpdateId);
  const comments = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-500">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-md border bg-white p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                <span>{c.userId.slice(0, 8)}</span>
                <span>{format(new Date(c.createdAt), "MMM d, yyyy h:mm a")}</span>
              </div>
              {c.deletedAt ? (
                <p className="text-sm italic text-slate-400">[deleted]</p>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
              )}
            </div>
          ))
        )}
      </div>
      <CommentReplyForm dailyUpdateId={dailyUpdateId} />
    </div>
  );
}
```

(Showing `userId.slice(0, 8)` is a Phase-1 placeholder — Plan 4 will add a `users` join in `listCommentsAction` and render real names.)

- [ ] **Step 3: Page**

Create `app/customer/projects/[projectId]/updates/[updateId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getDailyUpdateAction } from "@/lib/server-actions/daily-updates";
import { CommentThread } from "@/components/app/comment-thread";

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

export default async function CustomerDailyUpdatePage({
  params,
}: {
  params: Promise<{ updateId: string }>;
}) {
  const { updateId } = await params;
  const r = await getDailyUpdateAction(updateId);
  if (!r.ok) {
    if (r.error.code === "not_found" || r.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{r.error.message}</p>;
  }
  const u = r.data;

  return (
    <article className="space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <Badge variant="secondary">{ACTIVITY_LABELS[u.activityType] ?? u.activityType}</Badge>
          <span>{format(new Date(u.logDate), "MMM d, yyyy")}</span>
        </div>
        <h1 className="text-xl font-semibold">Daily update</h1>
      </header>

      <div className="rounded-md border bg-white p-4">
        <p className="whitespace-pre-wrap text-sm text-slate-800">{u.body}</p>
      </div>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Comments</h2>
        <CommentThread dailyUpdateId={updateId} />
      </section>
    </article>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add "app/customer/projects/[projectId]/updates" components/app/comment-thread.tsx components/app/comment-reply-form.tsx components/ui/textarea.tsx
git commit -m "feat(customer): daily update detail with comments thread + reply form"
```

---

### Task 8: Customer work requests list

**Files:**
- Create: `app/customer/requests/page.tsx`

- [ ] **Step 1: Implement**

Create `app/customer/requests/page.tsx`:

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listWorkRequestsAction } from "@/lib/server-actions/work-requests";

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

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export default async function CustomerRequestsPage() {
  const r = await listWorkRequestsAction({});
  const requests = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Work requests</h1>
        <Button asChild>
          <Link href="/customer/requests/new">
            <Plus className="mr-2 h-4 w-4" />
            New request
          </Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-slate-500">No requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/customer/requests/${req.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {req.title}
                    </Link>
                    <Badge variant={STATUS_VARIANT[req.status] ?? "outline"}>
                      {STATUS_LABELS[req.status] ?? req.status}
                    </Badge>
                  </div>
                  {req.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                      {req.description}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Priority: {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint}</div>
                  <div>{format(new Date(req.createdAt), "MMM d")}</div>
                </div>
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
pnpm typecheck && pnpm lint && pnpm build
git add app/customer/requests/page.tsx
git commit -m "feat(customer): work requests list page"
```

---

### Task 9: Customer work request submit page

**Files:**
- Create: `app/customer/requests/new/page.tsx`
- Create: `components/app/work-request-form.tsx`

A page with a project picker (defaulting to "(General — admin will route)") + title + description + priority hint dropdown, submitted via the `submitWorkRequestAction`.

- [ ] **Step 1: Form (client)**

Create `components/app/work-request-form.tsx`:

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
import { submitWorkRequestAction } from "@/lib/server-actions/work-requests";

type ProjectOption = { id: string; name: string };

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export function WorkRequestForm({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("__general");
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>("normal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    const r = await submitWorkRequestAction({
      title,
      description: description || undefined,
      projectId: projectId === "__general" ? undefined : projectId,
      priorityHint: priority,
    });
    setPending(false);
    if (!r.ok) {
      if (r.error.code === "validation" && r.error.fields) {
        setFieldErrors(r.error.fields);
      }
      setError(r.error.message);
      return;
    }
    router.push(`/customer/requests/${r.data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {fieldErrors.title && <p className="text-sm text-red-600">{fieldErrors.title}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={5}
          maxLength={10000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Project</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__general">(General — admin will route)</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={(v) => setPriority(v as typeof PRIORITIES[number])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
```

The `Select` component isn't installed yet:

```bash
pnpm dlx shadcn@latest add select
```

- [ ] **Step 2: Page**

Create `app/customer/requests/new/page.tsx`:

```tsx
import { listProjectsAction } from "@/lib/server-actions/projects";
import { WorkRequestForm } from "@/components/app/work-request-form";

export default async function CustomerNewRequestPage() {
  const r = await listProjectsAction({ status: "active" });
  const projects = r.ok ? r.data.map((p) => ({ id: p.id, name: p.name })) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New work request</h1>
      <p className="text-sm text-slate-600">
        Tell us what you need. We&apos;ll route it to the right team.
      </p>
      <WorkRequestForm projects={projects} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add app/customer/requests/new/page.tsx components/app/work-request-form.tsx components/ui/select.tsx
git commit -m "feat(customer): work request submit form"
```

---

### Task 10: Customer work request detail page

**Files:**
- Create: `app/customer/requests/[requestId]/page.tsx`

- [ ] **Step 1: Implement**

Create `app/customer/requests/[requestId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkRequestAction } from "@/lib/server-actions/work-requests";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted — awaiting review",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Marked as duplicate",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "default",
  accepted: "secondary",
  rejected: "destructive",
  duplicate: "outline",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export default async function CustomerRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const r = await getWorkRequestAction(requestId);
  if (!r.ok) {
    if (r.error.code === "not_found" || r.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{r.error.message}</p>;
  }
  const req = r.data;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{req.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Submitted {format(new Date(req.createdAt), "MMM d, yyyy h:mm a")}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[req.status] ?? "outline"}>
          {STATUS_LABELS[req.status] ?? req.status}
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="text-slate-500">Priority:</span>{" "}
            {PRIORITY_LABELS[req.priorityHint] ?? req.priorityHint}
          </div>
          {req.description && (
            <div>
              <div className="mb-1 text-slate-500">Description</div>
              <p className="whitespace-pre-wrap">{req.description}</p>
            </div>
          )}
          {req.rejectionReason && (
            <div>
              <div className="mb-1 text-slate-500">
                {req.status === "duplicate" ? "Note" : "Reason"}
              </div>
              <p className="whitespace-pre-wrap">{req.rejectionReason}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add "app/customer/requests/[requestId]/page.tsx"
git commit -m "feat(customer): work request detail page"
```

---

### Task 11: Customer notifications page

**Files:**
- Create: `app/customer/notifications/page.tsx`
- Create: `components/app/notifications-list.tsx`

Server-rendered list of notifications + a "mark all as read" button (client). Each notification renders a generic `event_type` + a "go to context" link based on `relatedType` + `relatedId`.

- [ ] **Step 1: NotificationsList (client — to handle mark-read interactions)**

Create `components/app/notifications-list.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markNotificationsReadAction } from "@/lib/server-actions/notifications";

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
  "task.assigned": "Task assigned to you",
  "task.status_changed": "Task status changed",
};

function relatedHref(n: Notification): string | null {
  // For Phase 1 customers, the only relevant deep links are work_request and daily_update.
  if (n.relatedType === "work_request" && n.relatedId) {
    return `/customer/requests/${n.relatedId}`;
  }
  if (n.relatedType === "daily_update" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/customer/projects/${projectId}/updates/${n.relatedId}`;
  }
  return null;
}

export function NotificationsList({ initial }: { initial: Notification[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items] = useState(initial);

  const unreadIds = items.filter((n) => !n.readAt).map((n) => n.id);

  function handleMarkAll() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await markNotificationsReadAction({ ids: unreadIds });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{unreadIds.length} unread</p>
        <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={pending || unreadIds.length === 0}>
          {pending ? "Marking…" : "Mark all as read"}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No notifications.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const href = relatedHref(n);
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
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />
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

Create `app/customer/notifications/page.tsx`:

```tsx
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { NotificationsList } from "@/components/app/notifications-list";

export default async function CustomerNotificationsPage() {
  const r = await listNotificationsAction({});
  const initial = r.ok ? r.data.notifications : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <NotificationsList initial={initial} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add app/customer/notifications/page.tsx components/app/notifications-list.tsx
git commit -m "feat(customer): notifications page with mark-all-read"
```

---

### Task 12: Customer Playwright E2E (work request submission flow)

**Files:**
- Create: `tests/e2e/customer-request.spec.ts`

A Playwright flow that signs in as the seeded customer (from Plan 1's seed), navigates dashboard → New request, fills the form, submits, and verifies the request appears on the requests list with status "Submitted".

- [ ] **Step 1: Test**

Create `tests/e2e/customer-request.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => { await closeSeedPool(); });

const PWD = "Passw0rd!Test123";

test("customer submits a work request and sees it in the list", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "customer@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/customer\/dashboard$/);

  // Click the dashboard CTA.
  await page.click('a:has-text("New work request")');
  await expect(page).toHaveURL(/\/customer\/requests\/new$/);

  // Fill + submit.
  await page.fill("input#title", "Test request from E2E");
  await page.fill("textarea#description", "Body text");
  await page.click('button:has-text("Submit request")');

  // Detail page.
  await expect(page).toHaveURL(/\/customer\/requests\/[^/]+$/);
  await expect(page.getByText("Test request from E2E")).toBeVisible();
  await expect(page.getByText("Submitted — awaiting review")).toBeVisible();

  // Back to list.
  await page.click('a:has-text("Requests")');
  await expect(page).toHaveURL(/\/customer\/requests$/);
  await expect(page.getByText("Test request from E2E")).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e
```

Expected: 4 (existing auth E2Es) + 1 new = 5 passing E2Es.

If the test fails because seeded customer has no projects to pick from, that's fine — the form's "(General — admin will route)" default works for the test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/customer-request.spec.ts
git commit -m "test(e2e): customer submits work request end-to-end"
```

---

### Task 13: Final verification + branch wrap

- [ ] **Step 1: Full sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

All clean. Test counts: 214 unit/integration (unchanged) + 5 Playwright E2E.

- [ ] **Step 2: Manual smoke (visual)**

```bash
pnpm dev
```

Visit http://localhost:3000 in a browser, sign in as the seeded customer (`customer@e2e.test` / `Passw0rd!Test123`), and click through:
- Dashboard renders projects + updates + tasks (or empty states)
- Projects list renders
- New request form submits and lands on detail
- Notifications page renders + bell shows count

This is a manual sanity check. The Playwright test in Task 12 covers the critical path; this is just a final eyeball.

- [ ] **Step 3: Commit any final fixes**

If the manual smoke surfaces a bug, fix it and commit. Otherwise this step is a no-op.

- [ ] **Step 4: Hand off**

The branch `feat/phase-1-customer-ui` is ready for merge into `main`. Plan 3b (Employee UI) follows.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`):

- §1 customer dashboard (active projects + daily updates feed + upcoming tasks + work request form) — Tasks 4 (dashboard), 5 (projects list), 6 (project detail w/ updates), 9 (request form) ✓
- §2 customer dashboard scope — fully covered ✓
- §8.5 customers viewing + commenting on daily updates — Task 7 (detail + thread + reply form) ✓
- §8.6 work request submission with optional projectId — Task 9 ✓
- §9.3 in-app notifications via 30s polling — Task 3 (bell) ✓
- §11 Result-handling pattern — every Server Action wraps via `withSessionContext`, returning the same `Result<T, AppError>` to the client ✓
- §14 project structure — `app/customer/...` flat directories (not route groups, matching Plan 1's convention) ✓

**Out of scope (deliberately):**
- Employee UI (Plan 3b)
- Admin UI (Plan 3c if needed)
- Real names on comments — currently shows truncated user IDs (placeholder); full users-join in Plan 4
- File attachment upload UI — deferred to Plan 4 (the service-layer is in place from Plan 2c, but customer UIs in this plan don't yet expose attachment uploads)

**Placeholder scan:** No "TBD" / "TODO" anywhere. Each step has full code.

**Type consistency:**
- `withSessionContext` signature matches `lib/services/_action.ts` and is used identically in every Server Action wrapper.
- `Result<T, AppError>` ergonomics: every Server Action returns the same shape; client code does `if (!r.ok)` and uses `r.error.code` + `r.error.fields`.
- Project/task/update types are inferred from Drizzle (`$inferSelect`) and re-exported from each service's `index.ts` as needed by the Server Action wrappers.

**Architectural decisions baked in:**
- Server Actions in `lib/server-actions/<feature>.ts`, not co-located with pages — keeps the ESLint boundary clean (`lib/server-actions/**` is added to the override).
- Pages are Server Components; only forms + interactive bits are `"use client"`. This minimizes JS shipped to the browser.
- `revalidatePath` is called after writes that affect the current page, so users see fresh data after submitting a comment / request / mark-read.
- Notifications bell polls via Server Action invocation rather than a dedicated `/api/...` route — simpler and Server Action de-duplication via Next.js cache helps.
- `relatedHref` mapping in `notifications-list.tsx` only knows about customer-relevant link targets (`work_request`, `daily_update`); admin/employee links land in those plans.
- Customer-specific paths use plain directories (`app/customer/...`) matching Plan 1's middleware gating convention.
