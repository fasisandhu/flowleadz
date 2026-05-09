# Phase 1 — Plan 3b: Employee UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the employee-facing dashboard and feature pages — dashboard with assigned tasks + recent activity, projects list/detail (assigned only), post daily update form, log time form, my tasks list with status changes, my time entries log, notifications. Reuses the Server Actions infrastructure from Plan 3a; extends it with write paths (createDailyUpdate, logTime, changeTaskStatus, etc.).

**Architecture:** Same patterns as Plan 3a. Pages are Server Components by default; forms + status-change buttons are `"use client"`. Server Action wrappers stay in `lib/server-actions/`. Employee-specific pages live under `app/employee/...`. The middleware (Plan 1) gates the route tree by `system_role = 'employee'`.

**Tech Stack:** Same as Plan 3a (Next.js 15, Server Actions, react-hook-form patterns we already use, shadcn/ui, date-fns, lucide-react).

**Branch:** Implement on `feat/phase-1-employee-ui`, branched from `main`. Last main commit at start: the Plan-3a merge (`fc29d58`).

---

## File structure created by this plan

```
lib/server-actions/
  daily-updates.ts                (extended with create + update mutations)
  tasks.ts                         (extended with changeTaskStatus mutation)
  time-entries.ts                  (NEW — log/list/update/delete)

app/employee/
  layout.tsx                       (REPLACED — nav + bell + sign out)
  dashboard/page.tsx               (REPLACED)
  projects/
    page.tsx
    [projectId]/
      page.tsx                     (project detail with task status changer)
      updates/new/page.tsx         (post daily update form)
      updates/[updateId]/page.tsx  (read-only detail)
      time/new/page.tsx            (log time form)
  tasks/page.tsx                   (my tasks)
  time/page.tsx                    (my time entries)
  notifications/page.tsx

components/app/
  employee-notifications-list.tsx  (employee-specific deep links)
  daily-update-form.tsx            ("use client" — for post + edit)
  log-time-form.tsx                ("use client")
  task-status-changer.tsx          ("use client" — dropdown + Server Action)
  time-entry-row.tsx               (server component)

tests/e2e/
  employee-time.spec.ts            (1 new E2E)
```

---

## Tasks

### Task 1: Server Action wrappers — write paths

**Files:**
- Modify: `lib/server-actions/daily-updates.ts` (add create + update mutations)
- Modify: `lib/server-actions/tasks.ts` (add changeTaskStatus + assign helpers)
- Create: `lib/server-actions/time-entries.ts` (new file)
- Modify: each affected service `index.ts` to re-export missing input types

- [ ] **Step 1: daily-updates writes**

Append to `lib/server-actions/daily-updates.ts` (preserve existing list/get/listRevisions exports):

```ts
import { revalidatePath } from "next/cache";
// (existing imports)

export async function createDailyUpdateAction(input: dailyUpdates.CreateDailyUpdateInput) {
  const result = await withSessionContext((db, ctx) => dailyUpdates.createDailyUpdate(db, ctx, input));
  if (result.ok) {
    revalidatePath("/employee/dashboard", "page");
    revalidatePath(`/employee/projects/${input.projectId}`, "page");
    revalidatePath(`/customer/projects/${input.projectId}`, "page");
  }
  return result;
}

export async function updateDailyUpdateAction(input: dailyUpdates.UpdateDailyUpdateInput) {
  const result = await withSessionContext((db, ctx) => dailyUpdates.updateDailyUpdate(db, ctx, input));
  if (result.ok) {
    revalidatePath(`/employee/projects/.+/updates/${input.id}`, "page");
    revalidatePath(`/customer/projects/.+/updates/${input.id}`, "page");
  }
  return result;
}
```

- [ ] **Step 2: tasks writes**

Append to `lib/server-actions/tasks.ts` (preserve existing list/get exports):

```ts
import { revalidatePath } from "next/cache";

export async function changeTaskStatusAction(input: tasks.ChangeTaskStatusInput) {
  const result = await withSessionContext((db, ctx) => tasks.changeTaskStatus(db, ctx, input));
  if (result.ok) {
    revalidatePath("/employee/tasks", "page");
    revalidatePath("/employee/dashboard", "page");
    revalidatePath(`/employee/projects/.+`, "page");
    revalidatePath(`/customer/projects/.+`, "page");
  }
  return result;
}
```

- [ ] **Step 3: time-entries (new file)**

Create `lib/server-actions/time-entries.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as timeEntries from "@/lib/services/time-entries";

export async function logTimeAction(input: timeEntries.LogTimeInput) {
  const result = await withSessionContext((db, ctx) => timeEntries.logTime(db, ctx, input));
  if (result.ok) {
    revalidatePath("/employee/time", "page");
    revalidatePath("/employee/dashboard", "page");
  }
  return result;
}

export async function listTimeEntriesAction(input: timeEntries.ListTimeEntriesInput = {}) {
  return withSessionContext((db, ctx) => timeEntries.listTimeEntries(db, ctx, input));
}

export async function updateTimeEntryAction(input: timeEntries.UpdateTimeEntryInput) {
  const result = await withSessionContext((db, ctx) => timeEntries.updateTimeEntry(db, ctx, input));
  if (result.ok) revalidatePath("/employee/time", "page");
  return result;
}

export async function deleteTimeEntryAction(input: timeEntries.DeleteTimeEntryInput) {
  const result = await withSessionContext((db, ctx) => timeEntries.deleteTimeEntry(db, ctx, input));
  if (result.ok) revalidatePath("/employee/time", "page");
  return result;
}
```

- [ ] **Step 4: Service index re-exports**

For each service, ensure `index.ts` re-exports the input types referenced above. The Plan 3a Task 2 implementer added similar re-exports — extend them as needed:

- `lib/services/daily-updates/index.ts`: should already export `CreateDailyUpdateInput`, `UpdateDailyUpdateInput`. Verify.
- `lib/services/tasks/index.ts`: should already export `ChangeTaskStatusInput`, `TaskAssignmentInput`. Verify.
- `lib/services/time-entries/index.ts`: needs `LogTimeInput`, `ListTimeEntriesInput`, `UpdateTimeEntryInput`, `DeleteTimeEntryInput`. Add `export type { ... } from "./schemas";` if missing.

If `pnpm typecheck` complains, add the missing exports.

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm test
git checkout -b feat/phase-1-employee-ui
git add lib/server-actions lib/services
git commit -m "feat(server-actions): write-path wrappers for daily-updates / tasks / time-entries"
```

Expected: 214 tests still pass; gates clean.

---

### Task 2: Employee layout — nav + bell + sign out

**Files:**
- Replace: `app/employee/layout.tsx`
- Create: `components/app/employee-notifications-list.tsx` (used in Task 11; declare it now empty? — no, defer creation to Task 11)

Just the layout for now. The bell uses the existing `NotificationsBell` component (it's role-agnostic) but the link points to `/employee/notifications`.

We need a small variant: the bell currently hard-codes `/customer/notifications`. Make it accept an `href` prop so we can re-use it cleanly.

- [ ] **Step 1: Update NotificationsBell to accept href**

Modify `components/app/notifications-bell.tsx`. Current hard-coded `href="/customer/notifications"` becomes a prop with that as default:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listNotificationsAction } from "@/lib/server-actions/notifications";

const POLL_INTERVAL_MS = 30_000;

export function NotificationsBell({
  initialUnreadCount,
  href = "/customer/notifications",
}: {
  initialUnreadCount: number;
  href?: string;
}) {
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
      href={href}
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

- [ ] **Step 2: Replace `app/employee/layout.tsx`**

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

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const notifs = await listNotificationsAction({ filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/employee/dashboard" className="font-semibold">
              Marketing CRM
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/employee/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <Link href="/employee/projects" className="hover:underline">
                Projects
              </Link>
              <Link href="/employee/tasks" className="hover:underline">
                My tasks
              </Link>
              <Link href="/employee/time" className="hover:underline">
                Time
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell initialUnreadCount={initialUnread} href="/employee/notifications" />
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
git add components/app/notifications-bell.tsx app/employee/layout.tsx
git commit -m "feat(employee): top-nav layout (Dashboard/Projects/Tasks/Time) + bell href prop"
```

---

### Task 3: Employee dashboard

**Files:**
- Replace: `app/employee/dashboard/page.tsx`

Composes:
- My open tasks (assigned + status in todo/in_progress/blocked) — top 5
- Recent updates I posted — top 5
- Quick links to "Post update" / "Log time"

Uses existing `DailyUpdateCard` + `TaskListItem` components. Filters `listTasksAction({})` (which scopes to assigned projects for employees) to those status values + assigned to me. Note: we don't currently have a "tasks assigned to user" filter on the service — the employee scope already filters to assigned projects, and we filter further client-side here for "tasks where I am one of the assignees." For Phase 1, since employees only see their assigned projects' tasks, the further filter isn't strictly necessary; show all active tasks in their projects.

- [ ] **Step 1: Replace dashboard**

```tsx
import Link from "next/link";
import { Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listProjectsAction } from "@/lib/server-actions/projects";
import { TaskListItem } from "@/components/app/task-list-item";
import { DailyUpdateCard } from "@/components/app/daily-update-card";

export default async function EmployeeDashboardPage() {
  const [tasksR, updatesR, projectsR] = await Promise.all([
    listTasksAction({}),
    listDailyUpdatesAction({}),
    listProjectsAction({ status: "active" }),
  ]);

  const openTasks = tasksR.ok
    ? tasksR.data
        .filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
        .slice(0, 5)
    : [];
  const recentUpdates = updatesR.ok ? updatesR.data.slice(0, 5) : [];
  const activeProjects = projectsR.ok ? projectsR.data : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          {activeProjects.length > 0 && (
            <Link
              href={`/employee/projects/${activeProjects[0]!.id}/updates/new`}
              className={cn(buttonVariants())}
            >
              <Plus className="mr-2 h-4 w-4" />
              Post update
            </Link>
          )}
          {activeProjects.length > 0 && (
            <Link
              href={`/employee/projects/${activeProjects[0]!.id}/time/new`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Clock className="mr-2 h-4 w-4" />
              Log time
            </Link>
          )}
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Open tasks</h2>
          <Link href="/employee/tasks" className="text-sm text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {openTasks.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing on deck.</p>
        ) : (
          <div className="space-y-2">
            {openTasks.map((t) => (
              <TaskListItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Recent updates</h2>
        {recentUpdates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {recentUpdates.map((u) => (
              <DailyUpdateCard
                key={u.id}
                update={u}
                hrefBase="/employee/projects"
              />
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
pnpm typecheck && pnpm lint && pnpm build
git add app/employee/dashboard/page.tsx
git commit -m "feat(employee): dashboard with open tasks + recent updates + quick actions"
```

---

### Task 4: Employee projects list

**Files:**
- Create: `app/employee/projects/page.tsx`

Same pattern as customer projects list, but routes to `/employee/projects/[id]`.

- [ ] **Step 1: Implement**

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

export default async function EmployeeProjectsPage() {
  const r = await listProjectsAction({});
  const projects = r.ok ? r.data : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Projects</h1>

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">No projects assigned to you yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link
                      href={`/employee/projects/${p.id}`}
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
git add app/employee/projects/page.tsx
git commit -m "feat(employee): projects list page (assigned only)"
```

---

### Task 5: Task status changer (client component)

**Files:**
- Create: `components/app/task-status-changer.tsx`

A dropdown that lets a user transition a task's status. Used in Task 6 (project detail) + Task 10 (my tasks).

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeTaskStatusAction } from "@/lib/server-actions/tasks";

const STATUSES = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export function TaskStatusChanger({
  taskId,
  currentStatus,
}: {
  taskId: string;
  currentStatus: typeof STATUSES[number];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string | null) {
    if (!next || next === currentStatus) return;
    setError(null);
    startTransition(async () => {
      const r = await changeTaskStatusAction({
        id: taskId,
        toStatus: next as typeof STATUSES[number],
      });
      if (!r.ok) {
        setError(r.error.message);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select value={currentStatus} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className="h-8 w-[140px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add components/app/task-status-changer.tsx
git commit -m "feat(employee): TaskStatusChanger client component (dropdown + Server Action)"
```

---

### Task 6: Employee project detail (with task status changes inline)

**Files:**
- Create: `app/employee/projects/[projectId]/page.tsx`

Project metadata + updates feed + tasks list with inline status changers.

- [ ] **Step 1: Implement**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskStatusChanger } from "@/components/app/task-status-changer";

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

export default async function EmployeeProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found" || projectR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [updatesR, tasksR] = await Promise.all([
    listDailyUpdatesAction({ projectId }),
    listTasksAction({ projectId }),
  ]);
  const updates = updatesR.ok ? updatesR.data : [];
  const tasks = tasksR.ok ? tasksR.data : [];

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
        <div className="flex flex-col items-end gap-2">
          <Badge variant="secondary" className="capitalize">
            {project.status}
          </Badge>
          <div className="flex gap-2">
            <Link
              href={`/employee/projects/${projectId}/updates/new`}
              className={cn(buttonVariants({ size: "sm" }))}
            >
              <Plus className="mr-1 h-3 w-3" />
              Post update
            </Link>
            <Link
              href={`/employee/projects/${projectId}/time/new`}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
            >
              <Clock className="mr-1 h-3 w-3" />
              Log time
            </Link>
          </div>
        </div>
      </header>

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
                      <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-xs">
                        {STATUS_LABELS[t.status] ?? t.status}
                      </Badge>
                      {t.dueDate && <span>Due {format(new Date(t.dueDate), "MMM d")}</span>}
                    </div>
                  </div>
                  <TaskStatusChanger
                    taskId={t.id}
                    currentStatus={t.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled"}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Updates</h2>
        {updates.length === 0 ? (
          <p className="text-sm text-slate-500">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {updates.map((u) => (
              <DailyUpdateCard key={u.id} update={u} hrefBase="/employee/projects" />
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
pnpm typecheck && pnpm lint && pnpm build
git add "app/employee/projects/[projectId]/page.tsx"
git commit -m "feat(employee): project detail with inline task status changers"
```

---

### Task 7: Daily update post form

**Files:**
- Create: `components/app/daily-update-form.tsx`
- Create: `app/employee/projects/[projectId]/updates/new/page.tsx`

The form lets the employee write the update body, pick activity type, set visibility (default customer_visible), pick log date (default today), and optionally link tasks from the project.

- [ ] **Step 1: DailyUpdateForm (client)**

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
import { createDailyUpdateAction } from "@/lib/server-actions/daily-updates";

const ACTIVITIES = ["planning", "execution", "review", "meeting", "admin", "other"] as const;
const VISIBILITIES = ["customer_visible", "internal_only"] as const;

const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

const VISIBILITY_LABELS: Record<string, string> = {
  customer_visible: "Visible to customer",
  internal_only: "Internal only",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type TaskOption = { id: string; title: string };

export function DailyUpdateForm({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: TaskOption[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [activityType, setActivityType] = useState<typeof ACTIVITIES[number]>("execution");
  const [visibility, setVisibility] = useState<typeof VISIBILITIES[number]>("customer_visible");
  const [logDate, setLogDate] = useState(todayISO());
  const [taskIds, setTaskIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    const r = await createDailyUpdateAction({
      projectId,
      body,
      activityType,
      visibility,
      logDate,
      taskIds: taskIds.length > 0 ? taskIds : undefined,
    });
    setPending(false);
    if (!r.ok) {
      if (r.error.code === "validation" && r.error.fields) {
        setFieldErrors(r.error.fields);
      }
      setError(r.error.message);
      return;
    }
    router.push(`/employee/projects/${projectId}/updates/${r.data.id}`);
  }

  function toggleTask(id: string) {
    setTaskIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="body">What happened today?</Label>
        <Textarea
          id="body"
          rows={6}
          required
          minLength={1}
          maxLength={20000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {fieldErrors.body && <p className="text-sm text-red-600">{fieldErrors.body}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Activity</Label>
          <Select
            value={activityType}
            onValueChange={(v) => v && setActivityType(v as typeof ACTIVITIES[number])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITIES.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Visibility</Label>
          <Select
            value={visibility}
            onValueChange={(v) => v && setVisibility(v as typeof VISIBILITIES[number])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITIES.map((v) => (
                <SelectItem key={v} value={v}>
                  {VISIBILITY_LABELS[v]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="logDate">Log date</Label>
        <Input
          id="logDate"
          type="date"
          required
          value={logDate}
          max={todayISO()}
          onChange={(e) => setLogDate(e.target.value)}
        />
        {fieldErrors.logDate && <p className="text-sm text-red-600">{fieldErrors.logDate}</p>}
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2">
          <Label>Linked tasks (optional)</Label>
          <div className="max-h-48 space-y-1 overflow-auto rounded-md border bg-white p-2">
            {tasks.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded p-1 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={taskIds.includes(t.id)}
                  onChange={() => toggleTask(t.id)}
                />
                {t.title}
              </label>
            ))}
          </div>
          {fieldErrors.taskIds && <p className="text-sm text-red-600">{fieldErrors.taskIds}</p>}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post update"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Page**

Create `app/employee/projects/[projectId]/updates/new/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateForm } from "@/components/app/daily-update-form";

export default async function EmployeeNewUpdatePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found" || projectR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }

  const tasksR = await listTasksAction({ projectId });
  const tasks = tasksR.ok
    ? tasksR.data
        .filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
        .map((t) => ({ id: t.id, title: t.title }))
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Post update — {projectR.data.name}</h1>
      <DailyUpdateForm projectId={projectId} tasks={tasks} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add components/app/daily-update-form.tsx "app/employee/projects/[projectId]/updates"
git commit -m "feat(employee): post daily update form (with task linking)"
```

---

### Task 8: Daily update detail (employee — read-only with comments)

**Files:**
- Create: `app/employee/projects/[projectId]/updates/[updateId]/page.tsx`

Same as the customer detail page but routed under `/employee/...`. Comments thread + reply works for employees too (the auth predicate `requireCommentWrite` allows anyone with read access on the parent update to comment).

- [ ] **Step 1: Implement**

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

const VISIBILITY_LABELS: Record<string, string> = {
  customer_visible: "Visible to customer",
  internal_only: "Internal only",
};

export default async function EmployeeDailyUpdatePage({
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
          <Badge variant={u.visibility === "internal_only" ? "outline" : "default"}>
            {VISIBILITY_LABELS[u.visibility] ?? u.visibility}
          </Badge>
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

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add "app/employee/projects/[projectId]/updates/[updateId]/page.tsx"
git commit -m "feat(employee): daily update detail (read-only) with comments thread"
```

---

### Task 9: Log time form

**Files:**
- Create: `components/app/log-time-form.tsx`
- Create: `app/employee/projects/[projectId]/time/new/page.tsx`

Form: pick task (within this project), enter minutes, pick log date (default today), optional note.

- [ ] **Step 1: LogTimeForm (client)**

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
import { logTimeAction } from "@/lib/server-actions/time-entries";

type TaskOption = { id: string; title: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function LogTimeForm({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: TaskOption[];
}) {
  const router = useRouter();
  const [taskId, setTaskId] = useState<string>(tasks[0]?.id ?? "");
  const [minutes, setMinutes] = useState<string>("60");
  const [loggedForDate, setLoggedForDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setPending(true);
    const m = Number.parseInt(minutes, 10);
    if (Number.isNaN(m) || m <= 0) {
      setFieldErrors({ minutes: "Must be a positive integer" });
      setPending(false);
      return;
    }
    const r = await logTimeAction({
      taskId,
      minutes: m,
      loggedForDate,
      note: note || undefined,
    });
    setPending(false);
    if (!r.ok) {
      if (r.error.code === "validation" && r.error.fields) {
        setFieldErrors(r.error.fields);
      }
      setError(r.error.message);
      return;
    }
    router.push(`/employee/projects/${projectId}`);
  }

  if (tasks.length === 0) {
    return (
      <Alert>
        <AlertDescription>No tasks on this project to log time against.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label>Task</Label>
        <Select value={taskId} onValueChange={(v) => v && setTaskId(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tasks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.taskId && <p className="text-sm text-red-600">{fieldErrors.taskId}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="minutes">Minutes</Label>
          <Input
            id="minutes"
            type="number"
            min={1}
            step={1}
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          {fieldErrors.minutes && <p className="text-sm text-red-600">{fieldErrors.minutes}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="loggedForDate">Date</Label>
          <Input
            id="loggedForDate"
            type="date"
            required
            value={loggedForDate}
            max={todayISO()}
            onChange={(e) => setLoggedForDate(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log time"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Page**

Create `app/employee/projects/[projectId]/time/new/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { LogTimeForm } from "@/components/app/log-time-form";

export default async function EmployeeLogTimePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found" || projectR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }

  const tasksR = await listTasksAction({ projectId });
  const tasks = tasksR.ok
    ? tasksR.data
        .filter((t) => t.status !== "cancelled")
        .map((t) => ({ id: t.id, title: t.title }))
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Log time — {projectR.data.name}</h1>
      <LogTimeForm projectId={projectId} tasks={tasks} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add components/app/log-time-form.tsx "app/employee/projects/[projectId]/time"
git commit -m "feat(employee): log time form (per-task with note)"
```

---

### Task 10: My tasks page (with status filter)

**Files:**
- Create: `app/employee/tasks/page.tsx`

A list of all tasks visible to the employee (already scoped to assigned projects), with optional `?status=` query filter and inline status changers.

- [ ] **Step 1: Implement**

```tsx
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { TaskStatusChanger } from "@/components/app/task-status-changer";

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

const FILTERS = ["all", "open", "todo", "in_progress", "blocked", "done", "cancelled"] as const;

export default async function EmployeeTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as typeof FILTERS[number])
    : "open";

  const r = await listTasksAction({});
  let tasks = r.ok ? r.data : [];
  if (filter === "open") {
    tasks = tasks.filter((t) => ["todo", "in_progress", "blocked"].includes(t.status));
  } else if (filter !== "all") {
    tasks = tasks.filter((t) => t.status === filter);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My tasks</h1>
      </div>

      <div className="flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={`/employee/tasks?status=${f}`}
            className={`rounded-full border px-3 py-1 ${
              filter === f ? "border-blue-500 bg-blue-50 text-blue-700" : "hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : STATUS_LABELS[f]}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">No tasks match.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-xs">
                      {STATUS_LABELS[t.status] ?? t.status}
                    </Badge>
                    {t.dueDate && <span>Due {format(new Date(t.dueDate), "MMM d")}</span>}
                    {t.projectId && (
                      <Link
                        href={`/employee/projects/${t.projectId}`}
                        className="text-blue-600 hover:underline"
                      >
                        View project
                      </Link>
                    )}
                  </div>
                </div>
                <TaskStatusChanger
                  taskId={t.id}
                  currentStatus={t.status as "todo" | "in_progress" | "blocked" | "done" | "cancelled"}
                />
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
git add app/employee/tasks/page.tsx
git commit -m "feat(employee): my tasks page with status filter + inline status changers"
```

---

### Task 11: My time entries page

**Files:**
- Create: `components/app/time-entry-row.tsx` (server)
- Create: `app/employee/time/page.tsx`

A table-like list of the employee's own time entries, grouped or sorted by date. Each row shows: log date, task title, minutes, note, rate (if present).

- [ ] **Step 1: TimeEntryRow component**

```tsx
import { format } from "date-fns";
import Link from "next/link";

type Entry = {
  id: string;
  loggedForDate: string;
  minutes: number;
  note: string | null;
  rateCentsPerHour: number | null;
  taskId: string;
  projectId: string;
};

type TaskMap = Record<string, { title: string; projectId: string }>;

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${m}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function TimeEntryRow({
  entry,
  task,
}: {
  entry: Entry;
  task: { title: string } | undefined;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-white p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{format(new Date(entry.loggedForDate), "MMM d")}</span>
          <span className="text-slate-400">·</span>
          <span className="font-medium">{formatMinutes(entry.minutes)}</span>
          <span className="text-slate-400">·</span>
          <Link
            href={`/employee/projects/${entry.projectId}`}
            className="text-blue-600 hover:underline"
          >
            {task?.title ?? "(unknown task)"}
          </Link>
        </div>
        {entry.note && <div className="mt-1 line-clamp-1 text-xs text-slate-500">{entry.note}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Page**

Create `app/employee/time/page.tsx`:

```tsx
import { listTimeEntriesAction } from "@/lib/server-actions/time-entries";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { TimeEntryRow } from "@/components/app/time-entry-row";

export default async function EmployeeTimePage() {
  const [entriesR, tasksR] = await Promise.all([
    listTimeEntriesAction({}),
    listTasksAction({}),
  ]);
  const entries = entriesR.ok ? entriesR.data : [];
  const taskMap = new Map<string, { title: string }>();
  if (tasksR.ok) {
    for (const t of tasksR.data) taskMap.set(t.id, { title: t.title });
  }

  // Sort newest-first by loggedForDate then createdAt.
  entries.sort((a, b) => {
    if (a.loggedForDate !== b.loggedForDate) return a.loggedForDate < b.loggedForDate ? 1 : -1;
    return new Date(a.createdAt as Date | string).getTime() < new Date(b.createdAt as Date | string).getTime() ? 1 : -1;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My time</h1>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No time logged yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <TimeEntryRow key={e.id} entry={e} task={taskMap.get(e.taskId)} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add components/app/time-entry-row.tsx app/employee/time/page.tsx
git commit -m "feat(employee): my time entries page (sorted newest-first)"
```

---

### Task 12: Employee notifications page

**Files:**
- Create: `components/app/employee-notifications-list.tsx`
- Create: `app/employee/notifications/page.tsx`

Same shape as customer's notifications-list but with employee-specific deep links (tasks → `/employee/tasks`, daily updates → `/employee/projects/.../updates/...`).

- [ ] **Step 1: EmployeeNotificationsList (client)**

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
  if (n.relatedType === "task" && n.relatedId) {
    return `/employee/tasks`;
  }
  if (n.relatedType === "daily_update" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    if (projectId) return `/employee/projects/${projectId}/updates/${n.relatedId}`;
  }
  if (n.relatedType === "comment" && n.relatedId) {
    const projectId = (n.payload as { projectId?: string }).projectId;
    const dailyUpdateId = (n.payload as { dailyUpdateId?: string }).dailyUpdateId;
    if (projectId && dailyUpdateId) return `/employee/projects/${projectId}/updates/${dailyUpdateId}`;
  }
  return null;
}

export function EmployeeNotificationsList({ initial }: { initial: Notification[] }) {
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

Create `app/employee/notifications/page.tsx`:

```tsx
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { EmployeeNotificationsList } from "@/components/app/employee-notifications-list";

export default async function EmployeeNotificationsPage() {
  const r = await listNotificationsAction({});
  const initial = r.ok
    ? r.data.notifications.map((n) => ({ ...n, payload: n.payload as Record<string, unknown> }))
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <EmployeeNotificationsList initial={initial} />
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
git add components/app/employee-notifications-list.tsx app/employee/notifications/page.tsx
git commit -m "feat(employee): notifications page with employee-specific deep links"
```

---

### Task 13: Playwright E2E (employee logs time)

**Files:**
- Create: `tests/e2e/employee-time.spec.ts`

Sign in as the seeded employee. Navigate to a project (admin needs to have created one first — seed handles it indirectly via the customer's request becoming a task on a project, but we can also create the project directly in the seed). Click "Log time," fill the form, submit, verify the entry appears on `/employee/time`.

The seed currently creates `org_acme_e2e` + memberships but no projects. We need to extend the seed to create a project + project_assignment for the employee, plus a task on the project.

- [ ] **Step 1: Extend seed to create a project + task + employee assignment**

Modify `tests/e2e/fixtures/seed.ts`. Find the part after creating users + the org/membership, and append:

```ts
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

  return { password: TEST_PASSWORD, projectId, taskId };
```

Update the return type of `seedTestUsers()` to expose `projectId` (and `taskId` for future tests). The existing `auth.spec.ts` and `customer-request.spec.ts` ignore the return value, so this is non-breaking.

Also extend `cleanupTestData` to delete project_assignments before the existing cascades:

```ts
export async function cleanupTestData() {
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
  await exec(
    `DELETE FROM projects WHERE org_id = (SELECT id FROM organizations WHERE slug = 'acme-e2e')`,
  );
  await exec(
    `DELETE FROM work_requests WHERE submitted_by IN (SELECT id FROM users WHERE email LIKE '%@e2e.test')`,
  );
  await exec(`DELETE FROM users WHERE email LIKE '%@e2e.test'`);
  await exec(`DELETE FROM organizations WHERE slug = 'acme-e2e'`);
}
```

(The order matters because of FK constraints. project_assignments references both users and projects; tasks reference projects + users.)

- [ ] **Step 2: Test**

Create `tests/e2e/employee-time.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("employee logs time on a task and sees it in My time", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "employee@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/employee\/dashboard$/, { timeout: 15_000 });

  // Click "Log time" on the dashboard (uses the first active project).
  await page.click('a:has-text("Log time")');
  await expect(page).toHaveURL(/\/employee\/projects\/[^/]+\/time\/new$/);

  // Fill the form. Task picker auto-selects the first task.
  await page.fill("input#minutes", "45");
  await page.fill("textarea#note", "E2E logged time");
  await page.click('button:has-text("Log time")');

  // Lands on project detail.
  await expect(page).toHaveURL(/\/employee\/projects\/[^/]+$/);

  // Navigate to My time.
  await page.click('a:has-text("Time")');
  await expect(page).toHaveURL(/\/employee\/time$/);
  await expect(page.getByText("45m")).toBeVisible();
  await expect(page.getByText("E2E logged time")).toBeVisible();
});
```

- [ ] **Step 3: Run + commit**

```bash
pnpm test:e2e
```

Expected: 5 prior + 1 new = 6 passing.

```bash
git add tests/e2e/fixtures/seed.ts tests/e2e/employee-time.spec.ts
git commit -m "test(e2e): employee logs time end-to-end + seed extends with project + task"
```

---

### Task 14: Final verification + branch wrap

- [ ] **Step 1: Full sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

All clean. Test counts: 214 unit/integration + 6 Playwright E2E.

- [ ] **Step 2: Manual smoke (optional)**

```bash
pnpm dev
```

Sign in as the seeded employee (`employee@e2e.test` / `Passw0rd!Test123`). Click through:
- Dashboard → tasks + updates render
- Projects list shows the assigned project
- Project detail shows tasks (with status changer) + updates
- Click "Post update" → form renders → can submit
- Click "Log time" → form renders → can submit
- My tasks shows tasks with filter
- My time shows entries
- Notifications page works

- [ ] **Step 3: Hand off**

The branch `feat/phase-1-employee-ui` is ready for merge into `main`.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`):

- §1 employee log updates / mark tasks / see assignments — Tasks 7 (post update), 5+10 (status changes), 10 (my tasks), 11 (my time) ✓
- §2 employee scope (log updates, mark complete, see assigned, log time) — fully covered ✓
- §8.3 daily update post — Task 7 (with task linking + visibility default) ✓
- §8.8 task status transitions — Task 5 (changer) + Task 6/10 (consumers) ✓
- §8.10 time entry log — Task 9 (form), Task 11 (read-side) ✓
- §9.3 in-app polling notifications — already in place from Plan 3a (NotificationsBell now takes `href` prop and is reused in Task 2's layout) ✓

**Out of scope (deliberately):**
- Admin UI (Plan 3c if needed)
- Edit/delete time entries from the UI — Service layer supports it (Plan 2a Task 16) but Phase 1 employee UI omits it (employees rarely correct time entries; admin can edit via Plan 3c admin UI)
- Edit existing daily updates from the UI — Service layer supports it; employee UI shows updates as read-only after post (Phase 2 enhancement)
- File attachment upload UI — deferred to Plan 4

**Placeholder scan:** No "TBD" / "TODO" anywhere. Each step has full code.

**Type consistency:**
- `TaskStatusChanger` accepts `currentStatus` typed as the same enum as `tasks.changeTaskStatus` expects.
- Server Action wrappers match the service signatures via `<feature>.<TypeName>Input` re-exports.
- `relatedHref` mapping for employee notifications differs from customer's (different deep link targets).

**Architectural decisions baked in:**
- `NotificationsBell` accepts `href` prop with `/customer/notifications` as default, so reusing it from Plan 3a is non-breaking.
- `TaskStatusChanger` calls `changeTaskStatusAction` directly — `revalidatePath` in the wrapper refreshes both employee and customer pages so the customer's view of the project also reflects the change.
- The seed E2E-side now creates a project + employee assignment + task so the dashboard "Log time" button works without first running an admin flow.
- Employees see ALL tasks on assigned projects, not just tasks where they are an assignee. This matches the service-layer behavior (`listTasks` for employees scopes by `project_assignments`, not `task_assignments`). Per-task assignment is still tracked in `task_assignments` but is more about notifications than visibility.
