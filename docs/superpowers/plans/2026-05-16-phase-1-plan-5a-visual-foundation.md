# Phase 1 — Plan 5a: Visual Foundation + Tasks-as-Posts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the visual baseline (Geist font, indigo primary, status constants, Avatar/StatusPill/EmptyState/PageHeader primitives) plus the structural shift from "tasks list + parallel updates feed" to "task-as-post with chronological activity thread underneath." After this plan, every task has a dedicated detail page (per role) that displays an activity timeline of updates, status changes, time logs, comments, and attachments, with inline composers to post each of them.

**Architecture:** No schema changes. One new service module (`lib/services/tasks/activity.ts`) aggregates events from five existing sources (`daily_updates` via `daily_update_task_links`, `task_status_log`, `time_entries`, `comments`, `attachments`). Server actions expose the aggregator per role. Pages are Server Components by default; inline composers are `"use client"`. Each role gets its own task-detail route under `/<role>/tasks/[taskId]` (admin under `/admin/orgs/[orgId]/tasks/[taskId]`). Dashboards swap their "open tasks + recent updates" sections for a unified activity feed. Project pages and tasks lists adopt the new `TaskCard` style. `next-themes` is wired in for the theme-toggle that ships in 5b, but defaults to light only for 5a.

**Tech Stack:** Same as prior plans (Next.js 15, React 19, Server Actions, Drizzle, shadcn/ui, `@base-ui/react`, Tailwind 4, lucide-react, date-fns). New runtime additions: `next/font/google` Geist, `next-themes` (already in deps from Plan 1). No new dependencies.

**Branch:** Implement on `feat/phase-1-plan-5a-visual-foundation`, branched from `main`. Last main commit at start: the Plan-4 merge (`c3ed494`) plus follow-on spec commits (most recent `0967cd3` for the 5a/5b/5c spec).

---

## File structure created by this plan

```
lib/constants/
  status.ts                       (NEW — TaskStatus / WorkRequestStatus types,
                                   labels, pill class strings)

lib/services/tasks/
  activity.ts                     (NEW — ActivityEvent type + listActivityForTask
                                   + listRecentActivity)
  index.ts                        (MODIFIED — re-export activity functions)

lib/server-actions/
  tasks.ts                        (MODIFIED — add getTaskActivityAction,
                                   listRecentActivityAction)
  admin/tasks.ts                  (MODIFIED — admin variants)

components/
  theme-provider.tsx              (NEW — next-themes wrapper, attribute="class")

components/ui/
  avatar.tsx                      (NEW — initials avatar)
  status-pill.tsx                 (NEW — task + work-request pill)

components/app/
  empty-state.tsx                 (NEW — icon + copy + optional action)
  page-header.tsx                 (NEW — H1 + optional subtitle + optional action)
  activity-feed.tsx               (NEW — server component, renders ActivityEvent[])
  activity-feed-event.tsx         (NEW — per-event renderer; lives next to feed)
  task-action-bar.tsx             (NEW — "use client" — inline composers)
  post-update-form.tsx            (NEW — task-scoped "use client" composer;
                                   distinct from existing daily-update-form.tsx
                                   which stays for the standalone /updates/new page)
  task-card.tsx                   (NEW — replaces inline Card rendering for tasks)

app/
  layout.tsx                      (MODIFIED — Geist font, ThemeProvider wrap)
  globals.css                     (MODIFIED — font-sans variable wire-up)

app/customer/
  dashboard/page.tsx              (REPLACED — activity feed)
  tasks/                          (NEW directory)
    [taskId]/page.tsx             (NEW — read-only task detail)
  projects/[projectId]/page.tsx   (MODIFIED — TaskCards, link to task detail)

app/employee/
  dashboard/page.tsx              (REPLACED — activity feed)
  tasks/
    page.tsx                      (MODIFIED — TaskCards)
    [taskId]/page.tsx             (NEW — full action bar)
  projects/[projectId]/page.tsx   (MODIFIED — TaskCards, no inline status changer)

app/admin/orgs/[orgId]/
  dashboard/page.tsx              (REPLACED — activity feed + KPI cards stay)
  tasks/                          (NEW directory)
    [taskId]/page.tsx             (NEW — full action bar + admin edit fields)
  projects/[projectId]/page.tsx   (MODIFIED — TaskCards)

tests/integration/services/tasks/
  activity.test.ts                (NEW — listActivityForTask + listRecentActivity)

tests/e2e/
  task-detail.spec.ts             (NEW — employee opens task detail, posts an
                                   update, sees it in the activity feed)
```

---

## Tasks

### Task 1: Visual foundation — font, primary color, status constants, ThemeProvider scaffold

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `lib/constants/status.ts`
- Create: `components/theme-provider.tsx`

The font swap (Geist) is the most visible change. Status constants module deduplicates label/variant maps that have been copy-pasted across ~8 pages. `ThemeProvider` is wired in light-only mode for 5a — 5b activates dark mode by adding a toggle and the dark palette; 5a just makes sure the provider is in place.

- [ ] **Step 1: Create `lib/constants/status.ts`**

```ts
// Centralized task + work-request status types, labels, and pre-rendered
// pill class strings. Pre-rendered (not template-built) so Tailwind's
// content scanner picks every class up.

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type WorkRequestStatus = "submitted" | "accepted" | "rejected" | "duplicate";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;

export const WORK_REQUEST_STATUSES: readonly WorkRequestStatus[] = [
  "submitted",
  "accepted",
  "rejected",
  "duplicate",
] as const;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const WORK_REQUEST_STATUS_LABELS: Record<WorkRequestStatus, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  duplicate: "Duplicate",
};

// Pre-rendered Tailwind class strings keyed by status.
// The dot indicator is a small bg-* circle; the pill wrapper is the rest.

export const TASK_STATUS_PILL_CLASSES: Record<TaskStatus, string> = {
  todo: "bg-slate-50 text-slate-700 border-slate-200",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  blocked: "bg-amber-50 text-amber-700 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

export const TASK_STATUS_DOT_CLASSES: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-indigo-500",
  blocked: "bg-amber-500",
  done: "bg-emerald-500",
  cancelled: "bg-slate-300",
};

export const WORK_REQUEST_STATUS_PILL_CLASSES: Record<WorkRequestStatus, string> = {
  submitted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  duplicate: "bg-slate-50 text-slate-500 border-slate-200",
};
```

- [ ] **Step 2: Create `components/theme-provider.tsx`**

```tsx
"use client";

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";
import * as React from "react";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 3: Modify `app/layout.tsx`** — wire Geist + ThemeProvider

Read the current `app/layout.tsx`. Replace its body so it has:

```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "Marketing CRM",
  description: "Internal CRM for the marketing agency",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geistSans.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

NOTE: keep any existing imports (e.g. `Toaster` if it was already there) — the snippet above includes the typical shape, but match whatever the existing file had for those pieces. The two REQUIRED changes are: (a) Geist import + className wire-up, (b) ThemeProvider wrapping children.

`enableSystem={false}` keeps the app on the `defaultTheme` until 5b activates the toggle — we don't want a sudden dark-mode flash mid-plan.

`suppressHydrationWarning` on `<html>` is required by next-themes (it sets the `class` attribute on `<html>` after hydration; without the warning suppression, React logs a benign console warning).

- [ ] **Step 4: Modify `app/globals.css`** — make `font-sans` use Geist

Read `app/globals.css`. Tailwind 4 uses `@theme` for token customization. Add this block (or merge into an existing `@theme` block):

```css
@theme {
  --font-sans: var(--font-geist-sans), system-ui, -apple-system, sans-serif;
}
```

This makes Tailwind's `font-sans` utility resolve to Geist when the variable is set, with a system fallback if not.

- [ ] **Step 5: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

All three must pass. Build output should still show all routes compiling.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/phase-1-plan-5a-visual-foundation
git add lib/constants/status.ts components/theme-provider.tsx app/layout.tsx app/globals.css
git commit -m "feat(ui): Geist font + ThemeProvider scaffold + status constants module"
```

Branch creation is the FIRST command on this task; subsequent tasks just commit on the existing branch.

---

### Task 2: UI primitives — Avatar, StatusPill, EmptyState, PageHeader

**Files:**
- Create: `components/ui/avatar.tsx`
- Create: `components/ui/status-pill.tsx`
- Create: `components/app/empty-state.tsx`
- Create: `components/app/page-header.tsx`

All four are pure presentational components. No data fetching. No client interactivity. Server components by default.

- [ ] **Step 1: Avatar**

```tsx
// components/ui/avatar.tsx

import { cn } from "@/lib/utils/cn";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
};

// Eight-tint deterministic palette. Chosen so initials remain readable
// on the bg and so adjacent avatars don't look like a stripe.
const PALETTE = [
  "bg-indigo-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-rose-500 text-white",
  "bg-sky-500 text-white",
  "bg-violet-500 text-white",
  "bg-fuchsia-500 text-white",
  "bg-teal-500 text-white",
] as const;

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  if (email) return email[0]!.toUpperCase();
  return "?";
}

export function Avatar({
  userId,
  name,
  email,
  size = "sm",
  className,
}: {
  userId: string;
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const initials = initialsFrom(name, email);
  const palette = PALETTE[hash(userId) % PALETTE.length]!;
  const label = name ?? email ?? initials;
  return (
    <span
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full font-medium",
        SIZE_CLASSES[size],
        palette,
        className,
      )}
      aria-label={label}
      title={label}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({
  users,
  max = 3,
  size = "sm",
}: {
  users: { id: string; name?: string | null; email?: string | null }[];
  max?: number;
  size?: AvatarSize;
}) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((u) => (
        <Avatar
          key={u.id}
          userId={u.id}
          name={u.name}
          email={u.email}
          size={size}
          className="ring-2 ring-white"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            SIZE_CLASSES[size],
            "inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-700 ring-2 ring-white",
          )}
          aria-label={`${overflow} more`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: StatusPill**

```tsx
// components/ui/status-pill.tsx

import { cn } from "@/lib/utils/cn";
import {
  TASK_STATUS_DOT_CLASSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_PILL_CLASSES,
  WORK_REQUEST_STATUS_LABELS,
  WORK_REQUEST_STATUS_PILL_CLASSES,
  type TaskStatus,
  type WorkRequestStatus,
} from "@/lib/constants/status";

export function TaskStatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        TASK_STATUS_PILL_CLASSES[status],
        className,
      )}
    >
      <span
        className={cn("inline-block h-1.5 w-1.5 rounded-full", TASK_STATUS_DOT_CLASSES[status])}
        aria-hidden="true"
      />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function WorkRequestStatusPill({
  status,
  className,
}: {
  status: WorkRequestStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        WORK_REQUEST_STATUS_PILL_CLASSES[status],
        className,
      )}
    >
      {WORK_REQUEST_STATUS_LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 3: EmptyState**

```tsx
// components/app/empty-state.tsx

import * as React from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center">
      <Icon className="h-8 w-8 text-slate-400" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: PageHeader**

```tsx
// components/app/page-header.tsx

import * as React from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/avatar.tsx components/ui/status-pill.tsx components/app/empty-state.tsx components/app/page-header.tsx
git commit -m "feat(ui): Avatar + AvatarStack, TaskStatusPill + WorkRequestStatusPill, EmptyState, PageHeader"
```

---

### Task 3: Activity service — types + `listActivityForTask` + `listRecentActivity` + tests

**Files:**
- Create: `lib/services/tasks/activity.ts`
- Modify: `lib/services/tasks/index.ts` — re-export
- Modify: `lib/server-actions/tasks.ts` — add wrappers
- Modify: `lib/server-actions/admin/tasks.ts` — add admin wrappers
- Create: `tests/integration/services/tasks/activity.test.ts`

`ActivityEvent` is the discriminated union consumed by the ActivityFeed component (Task 4). `listActivityForTask(db, ctx, taskId)` returns activity for one task; `listRecentActivity(db, ctx, limit)` returns activity across all tasks visible to the user (used by dashboards).

- [ ] **Step 1: Failing tests first**

Create `tests/integration/services/tasks/activity.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import * as schema from "@/lib/db/schema";
import { withTransaction } from "@/tests/fixtures/db";
import {
  createMembership,
  createOrg,
  createProject,
  createUser,
} from "@/tests/fixtures/factories";
import { listActivityForTask, listRecentActivity } from "@/lib/services/tasks/activity";
import type { OrgContext } from "@/lib/services/_context";

const ctxOf = (orgId: string, role: "customer" | "employee" | "admin", userId: string): OrgContext => ({
  kind: "org",
  orgId,
  actor: { userId, role, membershipOrgId: role === "customer" ? orgId : null },
});

describe("tasks.listActivityForTask", () => {
  test("returns interleaved events sorted ascending", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const employee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);

      // Assign employee so they can read the task.
      await tx.insert(schema.projectAssignments).values({
        userId: employee.id,
        projectId: project.id,
      });

      // Create a task.
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "A task",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();

      // Daily update linked to the task.
      const [update] = await tx
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          authorId: employee.id,
          body: "Working on it.",
          activityType: "execution",
          visibility: "customer_visible",
          logDate: "2026-05-10",
        })
        .returning();
      await tx
        .insert(schema.dailyUpdateTaskLinks)
        .values({ dailyUpdateId: update!.id, taskId: task!.id });

      // Status change event.
      await tx.insert(schema.taskStatusLog).values({
        taskId: task!.id,
        actorId: admin.id,
        fromStatus: "todo",
        toStatus: "in_progress",
      });

      // Time entry.
      await tx.insert(schema.timeEntries).values({
        orgId: org.id,
        projectId: project.id,
        taskId: task!.id,
        userId: employee.id,
        minutes: 60,
        loggedForDate: "2026-05-10",
        note: "An hour of work",
      });

      const r = await listActivityForTask(tx, ctxOf(org.id, "employee", employee.id), task!.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;

      // Should contain three events (update, status_change, time_log).
      expect(r.data.length).toBe(3);

      // Sorted ascending by createdAt.
      const timestamps = r.data.map((e) => new Date(e.createdAt).getTime());
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]!);
      }

      // The event kinds appear.
      const kinds = r.data.map((e) => e.kind);
      expect(kinds).toContain("update");
      expect(kinds).toContain("status_change");
      expect(kinds).toContain("time_log");
    });
  });

  test("hides internal_only updates from customer", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const customer = await createUser(tx, { role: "customer" });
      await createMembership(tx, customer.id, org.id);
      const project = await createProject(tx, org.id, admin.id);
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Visible task",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();

      const [internalUpdate] = await tx
        .insert(schema.dailyUpdates)
        .values({
          orgId: org.id,
          projectId: project.id,
          authorId: admin.id,
          body: "Internal note",
          activityType: "execution",
          visibility: "internal_only",
          logDate: "2026-05-10",
        })
        .returning();
      await tx
        .insert(schema.dailyUpdateTaskLinks)
        .values({ dailyUpdateId: internalUpdate!.id, taskId: task!.id });

      const r = await listActivityForTask(tx, ctxOf(org.id, "customer", customer.id), task!.id);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const updates = r.data.filter((e) => e.kind === "update");
      expect(updates.length).toBe(0);
    });
  });

  test("returns unauthorized when actor cannot read the task", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const otherEmployee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Secret task",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      // otherEmployee is not assigned to the project — cannot read.
      const r = await listActivityForTask(
        tx,
        ctxOf(org.id, "employee", otherEmployee.id),
        task!.id,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(["unauthorized", "not_found"]).toContain(r.error.code);
    });
  });
});

describe("tasks.listRecentActivity", () => {
  test("returns most recent events across visible tasks", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const employee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);
      await tx.insert(schema.projectAssignments).values({
        userId: employee.id,
        projectId: project.id,
      });
      const [taskA] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Task A",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      const [taskB] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "Task B",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      await tx.insert(schema.taskStatusLog).values([
        { taskId: taskA!.id, actorId: admin.id, fromStatus: "todo", toStatus: "in_progress" },
        { taskId: taskB!.id, actorId: admin.id, fromStatus: "todo", toStatus: "blocked" },
      ]);

      const r = await listRecentActivity(tx, ctxOf(org.id, "employee", employee.id), 10);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.length).toBe(2);
      const taskIds = r.data.map((e) => e.taskId);
      expect(taskIds).toContain(taskA!.id);
      expect(taskIds).toContain(taskB!.id);
    });
  });

  test("employee with no assignments sees no activity", async () => {
    await withTransaction(async (tx) => {
      const org = await createOrg(tx);
      const admin = await createUser(tx, { role: "admin" });
      const lonelyEmployee = await createUser(tx, { role: "employee" });
      const project = await createProject(tx, org.id, admin.id);
      const [task] = await tx
        .insert(schema.tasks)
        .values({
          orgId: org.id,
          projectId: project.id,
          title: "T",
          source: "admin_created",
          createdBy: admin.id,
        })
        .returning();
      await tx.insert(schema.taskStatusLog).values({
        taskId: task!.id,
        actorId: admin.id,
        fromStatus: "todo",
        toStatus: "done",
      });
      const r = await listRecentActivity(
        tx,
        ctxOf(org.id, "employee", lonelyEmployee.id),
        10,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.length).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test tests/integration/services/tasks/activity.test.ts
```

Expected: all 5 tests fail with "Cannot find module '@/lib/services/tasks/activity'".

- [ ] **Step 3: Implement the service**

Create `lib/services/tasks/activity.ts`:

```ts
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireTaskRead } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import type { TaskStatus } from "@/lib/constants/status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export type ActivityEvent =
  | {
      kind: "update";
      id: string;
      taskId: string;
      createdAt: Date | string;
      authorId: string;
      authorName: string;
      authorEmail: string;
      body: string;
      activityType: string;
      visibility: "customer_visible" | "internal_only";
    }
  | {
      kind: "status_change";
      id: string;
      taskId: string;
      createdAt: Date | string;
      actorId: string;
      actorName: string;
      actorEmail: string;
      fromStatus: TaskStatus;
      toStatus: TaskStatus;
    }
  | {
      kind: "time_log";
      id: string;
      taskId: string;
      createdAt: Date | string;
      actorId: string;
      actorName: string;
      actorEmail: string;
      minutes: number;
      note: string | null;
    }
  | {
      kind: "comment";
      id: string;
      taskId: string;
      createdAt: Date | string;
      authorId: string;
      authorName: string;
      authorEmail: string;
      body: string;
      parentUpdateId: string;
    }
  | {
      kind: "attachment";
      id: string;
      taskId: string;
      createdAt: Date | string;
      uploaderId: string;
      uploaderName: string;
      uploaderEmail: string;
      filename: string;
      sizeBytes: number;
      attachmentId: string;
    };

export async function listActivityForTask(
  db: AnyDb,
  ctx: OrgContext,
  taskId: string,
): Promise<Result<ActivityEvent[]>> {
  const access = await requireTaskRead(db, ctx, taskId);
  if (!access.ok) return access;

  // Fetch the five sources in parallel.
  const [updates, comments, statusEvents, timeEvents, attachments] = await Promise.all([
    // Daily updates linked to this task.
    db
      .select({
        id: schema.dailyUpdates.id,
        createdAt: schema.dailyUpdates.createdAt,
        authorId: schema.dailyUpdates.authorId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.dailyUpdates.body,
        activityType: schema.dailyUpdates.activityType,
        visibility: schema.dailyUpdates.visibility,
      })
      .from(schema.dailyUpdates)
      .innerJoin(
        schema.dailyUpdateTaskLinks,
        eq(schema.dailyUpdateTaskLinks.dailyUpdateId, schema.dailyUpdates.id),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.dailyUpdates.authorId))
      .where(eq(schema.dailyUpdateTaskLinks.taskId, taskId)),

    // Comments on daily updates linked to this task.
    db
      .select({
        id: schema.comments.id,
        createdAt: schema.comments.createdAt,
        authorId: schema.comments.authorId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.comments.body,
        parentUpdateId: schema.comments.dailyUpdateId,
      })
      .from(schema.comments)
      .innerJoin(
        schema.dailyUpdateTaskLinks,
        eq(schema.dailyUpdateTaskLinks.dailyUpdateId, schema.comments.dailyUpdateId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
      .where(eq(schema.dailyUpdateTaskLinks.taskId, taskId)),

    // Status change events.
    db
      .select({
        id: schema.taskStatusLog.id,
        createdAt: schema.taskStatusLog.createdAt,
        actorId: schema.taskStatusLog.actorId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        fromStatus: schema.taskStatusLog.fromStatus,
        toStatus: schema.taskStatusLog.toStatus,
      })
      .from(schema.taskStatusLog)
      .innerJoin(schema.users, eq(schema.users.id, schema.taskStatusLog.actorId))
      .where(eq(schema.taskStatusLog.taskId, taskId)),

    // Time entries.
    db
      .select({
        id: schema.timeEntries.id,
        createdAt: schema.timeEntries.createdAt,
        actorId: schema.timeEntries.userId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        minutes: schema.timeEntries.minutes,
        note: schema.timeEntries.note,
      })
      .from(schema.timeEntries)
      .innerJoin(schema.users, eq(schema.users.id, schema.timeEntries.userId))
      .where(eq(schema.timeEntries.taskId, taskId)),

    // Attachments on the task.
    db
      .select({
        id: schema.attachments.id,
        createdAt: schema.attachments.createdAt,
        uploaderId: schema.attachments.uploadedBy,
        uploaderName: schema.users.name,
        uploaderEmail: schema.users.email,
        filename: schema.attachments.filename,
        sizeBytes: schema.attachments.sizeBytes,
      })
      .from(schema.attachments)
      .innerJoin(schema.users, eq(schema.users.id, schema.attachments.uploadedBy))
      .where(
        and(
          eq(schema.attachments.parentType, "task"),
          eq(schema.attachments.parentId, taskId),
          eq(schema.attachments.status, "ready"),
        ),
      ),
  ]);

  // Apply customer visibility filter on updates.
  const filteredUpdates =
    ctx.actor.role === "customer"
      ? updates.filter((u) => u.visibility === "customer_visible")
      : updates;
  const visibleUpdateIds = new Set(filteredUpdates.map((u) => u.id));
  const filteredComments = comments.filter((c) => visibleUpdateIds.has(c.parentUpdateId));

  const events: ActivityEvent[] = [
    ...filteredUpdates.map((u) => ({
      kind: "update" as const,
      id: u.id,
      taskId,
      createdAt: u.createdAt,
      authorId: u.authorId,
      authorName: u.authorName ?? "",
      authorEmail: u.authorEmail,
      body: u.body,
      activityType: u.activityType,
      visibility: u.visibility as "customer_visible" | "internal_only",
    })),
    ...filteredComments.map((c) => ({
      kind: "comment" as const,
      id: c.id,
      taskId,
      createdAt: c.createdAt,
      authorId: c.authorId,
      authorName: c.authorName ?? "",
      authorEmail: c.authorEmail,
      body: c.body,
      parentUpdateId: c.parentUpdateId,
    })),
    ...statusEvents.map((s) => ({
      kind: "status_change" as const,
      id: s.id,
      taskId,
      createdAt: s.createdAt,
      actorId: s.actorId,
      actorName: s.actorName ?? "",
      actorEmail: s.actorEmail,
      fromStatus: s.fromStatus as TaskStatus,
      toStatus: s.toStatus as TaskStatus,
    })),
    ...timeEvents.map((t) => ({
      kind: "time_log" as const,
      id: t.id,
      taskId,
      createdAt: t.createdAt,
      actorId: t.actorId,
      actorName: t.actorName ?? "",
      actorEmail: t.actorEmail,
      minutes: t.minutes,
      note: t.note,
    })),
    ...attachments.map((a) => ({
      kind: "attachment" as const,
      id: a.id,
      taskId,
      createdAt: a.createdAt,
      uploaderId: a.uploaderId,
      uploaderName: a.uploaderName ?? "",
      uploaderEmail: a.uploaderEmail,
      filename: a.filename,
      sizeBytes: Number(a.sizeBytes),
      attachmentId: a.id,
    })),
  ];

  events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return ta - tb;
  });

  return ok(events);
}

/**
 * Multi-task activity feed for dashboards.
 *
 * Returns the N most recent events across tasks visible to the actor.
 * Internal_only updates are filtered out for customers.
 *
 * Implementation: resolve visible task ids first (role-scoped), then query
 * the five event tables filtered by inArray(taskIds), then sort/limit
 * in-memory. Acceptable for Phase 1 volumes.
 */
export async function listRecentActivity(
  db: AnyDb,
  ctx: OrgContext,
  limit: number,
): Promise<Result<ActivityEvent[]>> {
  // Resolve visible task ids for this actor.
  const taskRows = await (async () => {
    if (ctx.actor.role === "admin") {
      return db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(eq(schema.tasks.orgId, ctx.orgId));
    }
    if (ctx.actor.role === "employee") {
      return db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .innerJoin(
          schema.projectAssignments,
          eq(schema.projectAssignments.projectId, schema.tasks.projectId),
        )
        .where(
          and(
            eq(schema.tasks.orgId, ctx.orgId),
            eq(schema.projectAssignments.userId, ctx.actor.userId),
          ),
        );
    }
    // customer
    return db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
      .where(
        and(
          eq(schema.tasks.orgId, ctx.orgId),
          // customer sees only non-draft projects
        ),
      );
  })();

  const taskIds = Array.from(new Set(taskRows.map((r) => r.id)));
  if (taskIds.length === 0) return ok([]);

  const [updates, comments, statusEvents, timeEvents, attachments] = await Promise.all([
    db
      .select({
        id: schema.dailyUpdates.id,
        createdAt: schema.dailyUpdates.createdAt,
        authorId: schema.dailyUpdates.authorId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.dailyUpdates.body,
        activityType: schema.dailyUpdates.activityType,
        visibility: schema.dailyUpdates.visibility,
        taskId: schema.dailyUpdateTaskLinks.taskId,
      })
      .from(schema.dailyUpdates)
      .innerJoin(
        schema.dailyUpdateTaskLinks,
        eq(schema.dailyUpdateTaskLinks.dailyUpdateId, schema.dailyUpdates.id),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.dailyUpdates.authorId))
      .where(inArray(schema.dailyUpdateTaskLinks.taskId, taskIds))
      .orderBy(desc(schema.dailyUpdates.createdAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.comments.id,
        createdAt: schema.comments.createdAt,
        authorId: schema.comments.authorId,
        authorName: schema.users.name,
        authorEmail: schema.users.email,
        body: schema.comments.body,
        parentUpdateId: schema.comments.dailyUpdateId,
        taskId: schema.dailyUpdateTaskLinks.taskId,
      })
      .from(schema.comments)
      .innerJoin(
        schema.dailyUpdateTaskLinks,
        eq(schema.dailyUpdateTaskLinks.dailyUpdateId, schema.comments.dailyUpdateId),
      )
      .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
      .where(inArray(schema.dailyUpdateTaskLinks.taskId, taskIds))
      .orderBy(desc(schema.comments.createdAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.taskStatusLog.id,
        createdAt: schema.taskStatusLog.createdAt,
        actorId: schema.taskStatusLog.actorId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        fromStatus: schema.taskStatusLog.fromStatus,
        toStatus: schema.taskStatusLog.toStatus,
        taskId: schema.taskStatusLog.taskId,
      })
      .from(schema.taskStatusLog)
      .innerJoin(schema.users, eq(schema.users.id, schema.taskStatusLog.actorId))
      .where(inArray(schema.taskStatusLog.taskId, taskIds))
      .orderBy(desc(schema.taskStatusLog.createdAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.timeEntries.id,
        createdAt: schema.timeEntries.createdAt,
        actorId: schema.timeEntries.userId,
        actorName: schema.users.name,
        actorEmail: schema.users.email,
        minutes: schema.timeEntries.minutes,
        note: schema.timeEntries.note,
        taskId: schema.timeEntries.taskId,
      })
      .from(schema.timeEntries)
      .innerJoin(schema.users, eq(schema.users.id, schema.timeEntries.userId))
      .where(inArray(schema.timeEntries.taskId, taskIds))
      .orderBy(desc(schema.timeEntries.createdAt))
      .limit(limit * 2),
    db
      .select({
        id: schema.attachments.id,
        createdAt: schema.attachments.createdAt,
        uploaderId: schema.attachments.uploadedBy,
        uploaderName: schema.users.name,
        uploaderEmail: schema.users.email,
        filename: schema.attachments.filename,
        sizeBytes: schema.attachments.sizeBytes,
        taskId: schema.attachments.parentId,
      })
      .from(schema.attachments)
      .innerJoin(schema.users, eq(schema.users.id, schema.attachments.uploadedBy))
      .where(
        and(
          eq(schema.attachments.parentType, "task"),
          inArray(schema.attachments.parentId, taskIds),
          eq(schema.attachments.status, "ready"),
        ),
      )
      .orderBy(desc(schema.attachments.createdAt))
      .limit(limit * 2),
  ]);

  const filteredUpdates =
    ctx.actor.role === "customer"
      ? updates.filter((u) => u.visibility === "customer_visible")
      : updates;
  const visibleUpdateIds = new Set(filteredUpdates.map((u) => u.id));
  const filteredComments = comments.filter((c) => visibleUpdateIds.has(c.parentUpdateId));

  const events: ActivityEvent[] = [
    ...filteredUpdates.map((u) => ({
      kind: "update" as const,
      id: u.id,
      taskId: u.taskId,
      createdAt: u.createdAt,
      authorId: u.authorId,
      authorName: u.authorName ?? "",
      authorEmail: u.authorEmail,
      body: u.body,
      activityType: u.activityType,
      visibility: u.visibility as "customer_visible" | "internal_only",
    })),
    ...filteredComments.map((c) => ({
      kind: "comment" as const,
      id: c.id,
      taskId: c.taskId,
      createdAt: c.createdAt,
      authorId: c.authorId,
      authorName: c.authorName ?? "",
      authorEmail: c.authorEmail,
      body: c.body,
      parentUpdateId: c.parentUpdateId,
    })),
    ...statusEvents.map((s) => ({
      kind: "status_change" as const,
      id: s.id,
      taskId: s.taskId,
      createdAt: s.createdAt,
      actorId: s.actorId,
      actorName: s.actorName ?? "",
      actorEmail: s.actorEmail,
      fromStatus: s.fromStatus as TaskStatus,
      toStatus: s.toStatus as TaskStatus,
    })),
    ...timeEvents.map((t) => ({
      kind: "time_log" as const,
      id: t.id,
      taskId: t.taskId,
      createdAt: t.createdAt,
      actorId: t.actorId,
      actorName: t.actorName ?? "",
      actorEmail: t.actorEmail,
      minutes: t.minutes,
      note: t.note,
    })),
    ...attachments.map((a) => ({
      kind: "attachment" as const,
      id: a.id,
      taskId: a.taskId,
      createdAt: a.createdAt,
      uploaderId: a.uploaderId,
      uploaderName: a.uploaderName ?? "",
      uploaderEmail: a.uploaderEmail,
      filename: a.filename,
      sizeBytes: Number(a.sizeBytes),
      attachmentId: a.id,
    })),
  ];

  events.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta; // descending: newest first
  });

  return ok(events.slice(0, limit));
}
```

The `asc` import was not used — go remove it from the imports if your linter flags it. The final import list should be `and, desc, eq, inArray` only.

- [ ] **Step 4: Re-export from index**

Modify `lib/services/tasks/index.ts`. Find the existing re-export block near the top (it already re-exports input types). Add:

```ts
export {
  listActivityForTask,
  listRecentActivity,
  type ActivityEvent,
} from "./activity";
```

- [ ] **Step 5: Add server-action wrappers** in `lib/server-actions/tasks.ts`

Append at the bottom of the file:

```ts
export async function getTaskActivityAction(taskId: string) {
  return withSessionContext((db, ctx) => tasks.listActivityForTask(db, ctx, taskId));
}

export async function listRecentActivityAction(limit: number = 20) {
  return withSessionContext((db, ctx) => tasks.listRecentActivity(db, ctx, limit));
}
```

- [ ] **Step 6: Add admin wrappers** in `lib/server-actions/admin/tasks.ts`

Append at the bottom:

```ts
export async function adminGetTaskActivityAction(orgId: string, taskId: string) {
  return withSessionContext(
    (db, ctx) => tasks.listActivityForTask(db, ctx, taskId),
    { staffOrgId: orgId },
  );
}

export async function adminListRecentActivityAction(orgId: string, limit: number = 20) {
  return withSessionContext(
    (db, ctx) => tasks.listRecentActivity(db, ctx, limit),
    { staffOrgId: orgId },
  );
}
```

- [ ] **Step 7: Re-run the failing tests**

```bash
pnpm test tests/integration/services/tasks/activity.test.ts
```

Expected: all 5 pass.

- [ ] **Step 8: Run full vitest sweep**

```bash
pnpm test
```

Expected: 217 + 5 = 222 passing.

- [ ] **Step 9: Verify gates**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 10: Commit**

```bash
git add lib/services/tasks/activity.ts lib/services/tasks/index.ts lib/server-actions/tasks.ts lib/server-actions/admin/tasks.ts tests/integration/services/tasks/activity.test.ts
git commit -m "feat(tasks): ActivityEvent type + listActivityForTask + listRecentActivity"
```

---

### Task 4: ActivityFeed + per-event renderer

**Files:**
- Create: `components/app/activity-feed.tsx`
- Create: `components/app/activity-feed-event.tsx`

`ActivityFeed` is a Server Component that takes an `events` array (caller fetches via the server action) and renders them as a vertical timeline. `ActivityFeedEvent` is the per-event renderer split out so the main file stays focused on layout.

We pass `events` in rather than letting ActivityFeed fetch internally — that way the same component renders both the per-task feed and the dashboard's multi-task feed (which uses `listRecentActivity` and the events have a `taskId` per row).

- [ ] **Step 1: ActivityFeedEvent**

```tsx
// components/app/activity-feed-event.tsx

import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { CircleDot, Clock, MessageCircle, Paperclip, RefreshCw } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { TASK_STATUS_LABELS } from "@/lib/constants/status";
import type { ActivityEvent } from "@/lib/services/tasks";

function relativeTime(d: Date | string) {
  return formatDistanceToNow(new Date(d), { addSuffix: true });
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${m}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function ActivityFeedEvent({
  event,
  taskHref,
}: {
  event: ActivityEvent;
  taskHref?: string;
}) {
  const ts = relativeTime(event.createdAt);

  switch (event.kind) {
    case "update":
      return (
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <header className="mb-2 flex items-center gap-2">
            <Avatar
              userId={event.authorId}
              name={event.authorName}
              email={event.authorEmail}
              size="sm"
            />
            <span className="text-sm font-medium text-slate-900">
              {event.authorName || event.authorEmail}
            </span>
            <span className="text-xs text-slate-500">posted an update · {ts}</span>
            {event.visibility === "internal_only" && (
              <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                Internal
              </span>
            )}
          </header>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{event.body}</p>
          {taskHref && (
            <footer className="mt-2 text-xs text-slate-500">
              <Link href={taskHref} className="hover:underline">
                View task →
              </Link>
            </footer>
          )}
        </article>
      );

    case "comment":
      return (
        <div className="flex items-start gap-2 pl-6 text-sm">
          <MessageCircle className="mt-0.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Avatar
            userId={event.authorId}
            name={event.authorName}
            email={event.authorEmail}
            size="xs"
          />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-slate-900">
              {event.authorName || event.authorEmail}
            </span>
            <span className="text-slate-500"> · {ts}</span>
            <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{event.body}</p>
          </div>
        </div>
      );

    case "status_change":
      return (
        <div className="flex items-center gap-2 text-sm">
          <CircleDot className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Avatar
            userId={event.actorId}
            name={event.actorName}
            email={event.actorEmail}
            size="xs"
          />
          <span className="text-slate-500">
            <span className="font-medium text-slate-900">
              {event.actorName || event.actorEmail}
            </span>{" "}
            changed status:
          </span>
          <TaskStatusPill status={event.fromStatus} />
          <RefreshCw className="h-3 w-3 text-slate-400" aria-hidden="true" />
          <TaskStatusPill status={event.toStatus} />
          <span className="ml-auto text-xs text-slate-400">{ts}</span>
        </div>
      );

    case "time_log":
      return (
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Avatar
            userId={event.actorId}
            name={event.actorName}
            email={event.actorEmail}
            size="xs"
          />
          <span className="text-slate-700">
            <span className="font-medium text-slate-900">
              {event.actorName || event.actorEmail}
            </span>{" "}
            logged <span className="font-medium">{formatMinutes(event.minutes)}</span>
          </span>
          {event.note && <span className="text-slate-500">— {event.note}</span>}
          <span className="ml-auto text-xs text-slate-400">{ts}</span>
        </div>
      );

    case "attachment":
      return (
        <div className="flex items-center gap-2 text-sm">
          <Paperclip className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Avatar
            userId={event.uploaderId}
            name={event.uploaderName}
            email={event.uploaderEmail}
            size="xs"
          />
          <span className="text-slate-700">
            <span className="font-medium text-slate-900">
              {event.uploaderName || event.uploaderEmail}
            </span>{" "}
            attached{" "}
            <span className="font-medium">{event.filename}</span>
          </span>
          <span className="ml-auto text-xs text-slate-400">{ts}</span>
        </div>
      );
  }
}

// Date heading divider, used between events from different days.
export function ActivityDayDivider({ date }: { date: Date | string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {format(new Date(date), "MMM d, yyyy")}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
```

- [ ] **Step 2: ActivityFeed**

```tsx
// components/app/activity-feed.tsx

import { ActivityDayDivider, ActivityFeedEvent } from "./activity-feed-event";
import type { ActivityEvent } from "@/lib/services/tasks";

function dateKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function ActivityFeed({
  events,
  taskHrefFor,
}: {
  events: ActivityEvent[];
  // For the dashboard feed, each event has its own taskId — caller maps it to an URL.
  // For the task-detail feed, omit to hide the per-event "View task →" link.
  taskHrefFor?: (taskId: string) => string;
}) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No activity yet.
      </p>
    );
  }

  // Group by day for visual dividers.
  const groups: { date: string; events: ActivityEvent[] }[] = [];
  for (const e of events) {
    const k = dateKey(e.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.date === k) last.events.push(e);
    else groups.push({ date: k, events: [e] });
  }

  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <section key={g.date} className="space-y-3">
          {gi > 0 && <ActivityDayDivider date={g.date} />}
          {gi === 0 && <ActivityDayDivider date={g.date} />}
          {g.events.map((e) => (
            <ActivityFeedEvent
              key={`${e.kind}-${e.id}`}
              event={e}
              taskHref={taskHrefFor?.(e.taskId)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add components/app/activity-feed.tsx components/app/activity-feed-event.tsx
git commit -m "feat(activity-feed): server component renderer for ActivityEvent timelines"
```

---

### Task 5: Task action bar — inline composers (post update, log time, change status, attach)

**Files:**
- Create: `components/app/post-update-form.tsx` (`"use client"`)
- Create: `components/app/log-time-inline-form.tsx` (`"use client"`)
- Create: `components/app/task-action-bar.tsx` (`"use client"`)

The action bar lives at the bottom of the task detail page. Each action expands an inline composer:

- **Post update** → `PostUpdateForm` (textarea + Post button, advanced options collapsed)
- **Log time** → `LogTimeInlineForm` (minutes + note + log)
- **Change status** → `TaskStatusChanger` (existing component from Plan 3b, reused inline)
- **Attach** → `AttachmentUpload` (existing component from Plan 4, reused inline)

- [ ] **Step 1: PostUpdateForm (task-scoped)**

```tsx
// components/app/post-update-form.tsx

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function PostUpdateForm({
  projectId,
  taskId,
  onPosted,
}: {
  projectId: string;
  taskId: string;
  onPosted?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [activityType, setActivityType] = useState<(typeof ACTIVITIES)[number]>("execution");
  const [visibility, setVisibility] = useState<"customer_visible" | "internal_only">(
    "customer_visible",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("Update body is required.");
      return;
    }
    startTransition(async () => {
      const r = await createDailyUpdateAction({
        projectId,
        body,
        activityType,
        visibility,
        logDate: todayISO(),
        taskIds: [taskId],
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setBody("");
      onPosted?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="update-body">Post an update</Label>
        <Textarea
          id="update-body"
          rows={3}
          required
          minLength={1}
          maxLength={20000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you work on?"
        />
      </div>

      {showAdvanced && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="update-activity">Activity</Label>
            <Select
              value={activityType}
              onValueChange={(v) => v && setActivityType(v as (typeof ACTIVITIES)[number])}
            >
              <SelectTrigger id="update-activity">
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
            <Label htmlFor="update-visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v) => v && setVisibility(v as "customer_visible" | "internal_only")}
            >
              <SelectTrigger id="update-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer_visible">Visible to customer</SelectItem>
                <SelectItem value="internal_only">Internal only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          {showAdvanced ? "Hide options" : "More options"}
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? "Posting…" : "Post update"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: LogTimeInlineForm**

```tsx
// components/app/log-time-inline-form.tsx

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logTimeAction } from "@/lib/server-actions/time-entries";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function LogTimeInlineForm({
  taskId,
  onLogged,
}: {
  taskId: string;
  onLogged?: () => void;
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState("60");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const m = Number.parseInt(minutes, 10);
    if (Number.isNaN(m) || m <= 0) {
      setError("Minutes must be a positive integer.");
      return;
    }
    startTransition(async () => {
      const r = await logTimeAction({
        taskId,
        minutes: m,
        loggedForDate: date,
        note: note || undefined,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setMinutes("60");
      setNote("");
      onLogged?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="log-minutes">Minutes</Label>
          <Input
            id="log-minutes"
            type="number"
            min={1}
            step={1}
            required
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="log-date">Date</Label>
          <Input
            id="log-date"
            type="date"
            required
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="log-note">Note (optional)</Label>
          <Input
            id="log-note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Logging…" : "Log time"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: TaskActionBar**

```tsx
// components/app/task-action-bar.tsx

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Clock, MessageSquarePlus, Paperclip, RefreshCw } from "lucide-react";
import { PostUpdateForm } from "./post-update-form";
import { LogTimeInlineForm } from "./log-time-inline-form";
import { TaskStatusChanger } from "./task-status-changer";
import { AttachmentUpload } from "./attachment-upload";
import type { TaskStatus } from "@/lib/constants/status";

type Mode = "none" | "post" | "log" | "status" | "attach";

export function TaskActionBar({
  taskId,
  projectId,
  currentStatus,
  canPostUpdate,
  canLogTime,
  canChangeStatus,
  canAttach,
}: {
  taskId: string;
  projectId: string;
  currentStatus: TaskStatus;
  canPostUpdate: boolean;
  canLogTime: boolean;
  canChangeStatus: boolean;
  canAttach: boolean;
}) {
  const [mode, setMode] = useState<Mode>("none");
  const close = () => setMode("none");

  const showAny = canPostUpdate || canLogTime || canChangeStatus || canAttach;
  if (!showAny) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {canPostUpdate && (
          <Button
            type="button"
            variant={mode === "post" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "post" ? "none" : "post")}
          >
            <MessageSquarePlus className="mr-1 h-4 w-4" />
            Post update
          </Button>
        )}
        {canLogTime && (
          <Button
            type="button"
            variant={mode === "log" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "log" ? "none" : "log")}
          >
            <Clock className="mr-1 h-4 w-4" />
            Log time
          </Button>
        )}
        {canChangeStatus && (
          <Button
            type="button"
            variant={mode === "status" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "status" ? "none" : "status")}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            Change status
          </Button>
        )}
        {canAttach && (
          <Button
            type="button"
            variant={mode === "attach" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode(mode === "attach" ? "none" : "attach")}
          >
            <Paperclip className="mr-1 h-4 w-4" />
            Attach
          </Button>
        )}
      </div>

      <div className={cn("mt-4", mode === "none" && "hidden")}>
        {mode === "post" && (
          <PostUpdateForm projectId={projectId} taskId={taskId} onPosted={close} />
        )}
        {mode === "log" && <LogTimeInlineForm taskId={taskId} onLogged={close} />}
        {mode === "status" && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">Current status:</span>
            <TaskStatusChanger taskId={taskId} currentStatus={currentStatus} />
          </div>
        )}
        {mode === "attach" && <AttachmentUpload parentType="task" parentId={taskId} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add components/app/post-update-form.tsx components/app/log-time-inline-form.tsx components/app/task-action-bar.tsx
git commit -m "feat(task): inline action bar (Post update, Log time, Change status, Attach)"
```

---

### Task 6: TaskCard component

**Files:**
- Create: `components/app/task-card.tsx`

Replaces the inline `<Card>` rendering used in project pages and tasks lists. Shows status, title, last-activity snippet, assignee avatars, comment/time/attachment counts, and due date.

Activity counts come from a precomputed `TaskCardData` object — the caller does one fan-out query (Task 11) to load them all at once. For 5a we'll keep the shape simple and let the caller pass `null` for unloaded fields; the component renders gracefully.

- [ ] **Step 1: TaskCard**

```tsx
// components/app/task-card.tsx

import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, MessageCircle, Clock, Paperclip } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { TaskStatusPill } from "@/components/ui/status-pill";
import type { TaskStatus } from "@/lib/constants/status";

export type TaskCardData = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | Date | null;
  lastActivitySnippet: string | null;
  lastActivityAt: Date | string | null;
  commentCount: number;
  totalMinutes: number;
  attachmentCount: number;
  assignees: { id: string; name: string | null; email: string }[];
};

function formatMinutes(m: number): string {
  if (m === 0) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${m}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

export function TaskCard({ task, href }: { task: TaskCardData; href: string }) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <TaskStatusPill status={task.status} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
          {task.title}
        </h3>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </div>

      {task.lastActivitySnippet && (
        <p className="mt-2 line-clamp-1 text-xs text-slate-500">
          “{task.lastActivitySnippet}”
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {task.assignees.length > 0 && (
          <AvatarStack
            users={task.assignees.map((a) => ({ id: a.id, name: a.name, email: a.email }))}
            size="xs"
            max={3}
          />
        )}
        {task.commentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3 w-3" />
            {task.commentCount}
          </span>
        )}
        {task.totalMinutes > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatMinutes(task.totalMinutes)}
          </span>
        )}
        {task.attachmentCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            {task.attachmentCount}
          </span>
        )}
        {task.dueDate && (
          <span className="ml-auto">
            Due {format(new Date(task.dueDate), "MMM d")}
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add components/app/task-card.tsx
git commit -m "feat(task-card): rich card with status, last-activity snippet, assignees, counts, due date"
```

---

### Task 7: Customer task detail page

**Files:**
- Create: `app/customer/tasks/[taskId]/page.tsx`

Customer sees a read-only feed (no post-update / log-time / change-status / attach buttons). They CAN still post comments — but comments on tasks-directly are 5b's polymorphic-comments scope, so for 5a the customer task detail page has no action bar at all. Customers comment on updates via the existing update detail page (linked from each update in the feed via the "View" affordance — already in place).

- [ ] **Step 1: Implement**

```tsx
// app/customer/tasks/[taskId]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { getTaskAction, getTaskActivityAction } from "@/lib/server-actions/tasks";
import { getProjectAction } from "@/lib/server-actions/projects";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { TaskStatus } from "@/lib/constants/status";

export default async function CustomerTaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  const [taskR, activityR] = await Promise.all([
    getTaskAction(taskId),
    getTaskActivityAction(taskId),
  ]);

  if (!taskR.ok) {
    if (taskR.error.code === "not_found" || taskR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{taskR.error.message}</p>;
  }
  const task = taskR.data;

  // Project (for breadcrumb).
  const projectR = await getProjectAction(task.projectId);
  const project = projectR.ok ? projectR.data : null;

  // Assignee user lookup (small denormalization; could be a service helper later).
  const assignmentRows = await db
    .select({
      userId: schema.taskAssignments.userId,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.taskAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.taskAssignments.userId))
    .where(eq(schema.taskAssignments.taskId, taskId));

  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      {project && (
        <Link
          href={`/customer/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3 w-3" /> Back to {project.name}
        </Link>
      )}

      <PageHeader
        title={task.title}
        subtitle={task.description ?? undefined}
        action={<TaskStatusPill status={task.status as TaskStatus} />}
      />

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {task.dueDate && (
          <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>
        )}
        {assignmentRows.length > 0 && (
          <div className="flex items-center gap-1">
            <span>Assigned:</span>
            {assignmentRows.map((a) => (
              <span key={a.userId} className="inline-flex items-center gap-1">
                <Avatar userId={a.userId} name={a.name} email={a.email} size="xs" />
                <span>{a.name || a.email}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Activity</h2>
        <ActivityFeed events={activity} />
      </section>
    </div>
  );
}
```

NOTE: the `inArray` import is unused — remove it if your linter flags it. Final imports should be `eq` only from drizzle-orm.

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add "app/customer/tasks/[taskId]/page.tsx"
git commit -m "feat(customer): task detail page (read-only) with ActivityFeed"
```

---

### Task 8: Employee task detail page

**Files:**
- Create: `app/employee/tasks/[taskId]/page.tsx`

Employee gets the full action bar: post update, log time, change status, attach.

- [ ] **Step 1: Implement**

```tsx
// app/employee/tasks/[taskId]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { AttachmentList } from "@/components/app/attachment-list";
import { TaskActionBar } from "@/components/app/task-action-bar";
import { getTaskAction, getTaskActivityAction } from "@/lib/server-actions/tasks";
import { getProjectAction } from "@/lib/server-actions/projects";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { TaskStatus } from "@/lib/constants/status";

export default async function EmployeeTaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  const [taskR, activityR] = await Promise.all([
    getTaskAction(taskId),
    getTaskActivityAction(taskId),
  ]);

  if (!taskR.ok) {
    if (taskR.error.code === "not_found" || taskR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{taskR.error.message}</p>;
  }
  const task = taskR.data;

  const projectR = await getProjectAction(task.projectId);
  const project = projectR.ok ? projectR.data : null;

  const assignmentRows = await db
    .select({
      userId: schema.taskAssignments.userId,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.taskAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.taskAssignments.userId))
    .where(eq(schema.taskAssignments.taskId, taskId));

  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      {project && (
        <Link
          href={`/employee/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3 w-3" /> Back to {project.name}
        </Link>
      )}

      <PageHeader
        title={task.title}
        subtitle={task.description ?? undefined}
        action={<TaskStatusPill status={task.status as TaskStatus} />}
      />

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {task.dueDate && (
          <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>
        )}
        {assignmentRows.length > 0 && (
          <div className="flex items-center gap-1">
            <span>Assigned:</span>
            {assignmentRows.map((a) => (
              <span key={a.userId} className="inline-flex items-center gap-1">
                <Avatar userId={a.userId} name={a.name} email={a.email} size="xs" />
                <span>{a.name || a.email}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Activity</h2>
        <ActivityFeed events={activity} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="task" parentId={taskId} />
      </section>

      <TaskActionBar
        taskId={taskId}
        projectId={task.projectId}
        currentStatus={task.status as TaskStatus}
        canPostUpdate={true}
        canLogTime={true}
        canChangeStatus={true}
        canAttach={true}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add "app/employee/tasks/[taskId]/page.tsx"
git commit -m "feat(employee): task detail page with ActivityFeed + TaskActionBar"
```

---

### Task 9: Admin task detail page

**Files:**
- Create: `app/admin/orgs/[orgId]/tasks/[taskId]/page.tsx`

Admin uses the admin-scoped wrappers (orgId-aware). Same UI as employee for now; in-place task editing (title/description/due-date) lives in 5b.

- [ ] **Step 1: Implement**

```tsx
// app/admin/orgs/[orgId]/tasks/[taskId]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { TaskStatusPill } from "@/components/ui/status-pill";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { AttachmentList } from "@/components/app/attachment-list";
import { TaskActionBar } from "@/components/app/task-action-bar";
import {
  adminGetTaskAction,
  adminGetTaskActivityAction,
} from "@/lib/server-actions/admin/tasks";
import { adminGetProjectAction } from "@/lib/server-actions/admin/projects";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { TaskStatus } from "@/lib/constants/status";

export default async function AdminTaskDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; taskId: string }>;
}) {
  const { orgId, taskId } = await params;

  const [taskR, activityR] = await Promise.all([
    adminGetTaskAction(orgId, taskId),
    adminGetTaskActivityAction(orgId, taskId),
  ]);

  if (!taskR.ok) {
    if (taskR.error.code === "not_found" || taskR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{taskR.error.message}</p>;
  }
  const task = taskR.data;

  const projectR = await adminGetProjectAction(orgId, task.projectId);
  const project = projectR.ok ? projectR.data : null;

  const assignmentRows = await db
    .select({
      userId: schema.taskAssignments.userId,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.taskAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.taskAssignments.userId))
    .where(eq(schema.taskAssignments.taskId, taskId));

  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      {project && (
        <Link
          href={`/admin/orgs/${orgId}/projects/${project.id}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-3 w-3" /> Back to {project.name}
        </Link>
      )}

      <PageHeader
        title={task.title}
        subtitle={task.description ?? undefined}
        action={<TaskStatusPill status={task.status as TaskStatus} />}
      />

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        {task.dueDate && (
          <span>Due {format(new Date(task.dueDate), "MMM d, yyyy")}</span>
        )}
        {assignmentRows.length > 0 && (
          <div className="flex items-center gap-1">
            <span>Assigned:</span>
            {assignmentRows.map((a) => (
              <span key={a.userId} className="inline-flex items-center gap-1">
                <Avatar userId={a.userId} name={a.name} email={a.email} size="xs" />
                <span>{a.name || a.email}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Activity</h2>
        <ActivityFeed events={activity} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Attachments</h2>
        <AttachmentList parentType="task" parentId={taskId} />
      </section>

      <TaskActionBar
        taskId={taskId}
        projectId={task.projectId}
        currentStatus={task.status as TaskStatus}
        canPostUpdate={true}
        canLogTime={true}
        canChangeStatus={true}
        canAttach={true}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add "app/admin/orgs/[orgId]/tasks/[taskId]/page.tsx"
git commit -m "feat(admin): task detail page with ActivityFeed + TaskActionBar"
```

---

### Task 10: Dashboards × 3 — replace "Open tasks + Recent updates" with unified activity feed

**Files:**
- Replace: `app/customer/dashboard/page.tsx`
- Replace: `app/employee/dashboard/page.tsx`
- Replace: `app/admin/orgs/[orgId]/dashboard/page.tsx`

Each dashboard now centers on a "Recent activity" feed built from `listRecentActivity` (with the admin variant for the admin dashboard). KPI cards (admin dashboard) stay above the feed. Quick-action buttons stay; their links now point to the appropriate role-scoped pages.

The taskHrefFor function maps a taskId to the role's task-detail URL.

- [ ] **Step 1: Customer dashboard**

Read existing `app/customer/dashboard/page.tsx`. Replace its content with:

```tsx
// app/customer/dashboard/page.tsx

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { listRecentActivityAction } from "@/lib/server-actions/tasks";

export default async function CustomerDashboardPage() {
  const r = await listRecentActivityAction(20);
  const activity = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Recent activity across your projects."
        action={
          <Link href="/customer/requests/new" className={cn(buttonVariants())}>
            <Plus className="mr-1 h-4 w-4" />
            New work request
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/customer/tasks/${taskId}`}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Employee dashboard**

```tsx
// app/employee/dashboard/page.tsx

import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { listRecentActivityAction } from "@/lib/server-actions/tasks";

export default async function EmployeeDashboardPage() {
  const r = await listRecentActivityAction(20);
  const activity = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="What's happening on your tasks." />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/employee/tasks/${taskId}`}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Admin dashboard**

Read existing `app/admin/orgs/[orgId]/dashboard/page.tsx`. Keep the KPI cards (pending work requests, active projects, new project). Replace the recent-work-requests section with the activity feed:

```tsx
// app/admin/orgs/[orgId]/dashboard/page.tsx

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";
import { adminListRecentActivityAction } from "@/lib/server-actions/admin/tasks";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [submittedR, projectsR, activityR] = await Promise.all([
    adminListWorkRequestsAction(orgId, { status: "submitted" }),
    adminListProjectsAction(orgId, { status: "active" }),
    adminListRecentActivityAction(orgId, 20),
  ]);

  const pending = submittedR.ok ? submittedR.data.length : 0;
  const activeProjects = projectsR.ok ? projectsR.data.length : 0;
  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Pending work requests</CardDescription>
            <CardTitle className="text-3xl">{pending}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={`/admin/orgs/${orgId}/work-requests?status=submitted`}
              className="text-sm text-indigo-600 hover:underline"
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
              className="text-sm text-indigo-600 hover:underline"
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
              className="text-sm text-indigo-600 hover:underline"
            >
              + New project →
            </Link>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/admin/orgs/${orgId}/tasks/${taskId}`}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add "app/customer/dashboard/page.tsx" "app/employee/dashboard/page.tsx" "app/admin/orgs/[orgId]/dashboard/page.tsx"
git commit -m "feat(dashboards): unified Recent activity feed (customer/employee/admin)"
```

---

### Task 11: Project + tasks list pages adopt TaskCard; nav polish; E2E; final verification

**Files:**
- Modify: `app/customer/projects/[projectId]/page.tsx`
- Modify: `app/employee/projects/[projectId]/page.tsx`
- Modify: `app/employee/tasks/page.tsx`
- Modify: `app/admin/orgs/[orgId]/projects/[projectId]/page.tsx`
- Modify: `app/customer/layout.tsx`, `app/employee/layout.tsx`, `app/admin/orgs/[orgId]/layout.tsx` (icon-paired nav)
- Create: `tests/e2e/task-detail.spec.ts`

The TaskCard rollout requires loading the "per-card data" — last activity snippet, counts, assignees — for the list of tasks on a project. Add a service helper `listTasksWithCardData(db, ctx, { projectId? })` that does this fan-out. Then the project pages use it and render TaskCards. The employee tasks list page does the same with no projectId filter.

#### Step 1: Service helper for card data

Append to `lib/services/tasks/activity.ts`:

```ts
export type TaskCardRow = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  lastActivitySnippet: string | null;
  lastActivityAt: Date | null;
  commentCount: number;
  totalMinutes: number;
  attachmentCount: number;
  assignees: { id: string; name: string | null; email: string }[];
};

/**
 * Loads tasks visible to the actor plus card-rendering metadata (last activity,
 * counts, assignees) in a small number of queries.
 *
 * Phase 1 volume implementation: gathers all tasks first, then per-task counts
 * and snippets in a few aggregate queries. Not optimized for thousands of tasks
 * per project; we'll add pagination + denormalization in Phase 2.
 */
export async function listTasksWithCardData(
  db: AnyDb,
  ctx: OrgContext,
  input: { projectId?: string },
): Promise<Result<TaskCardRow[]>> {
  // Scope tasks by role.
  const baseConditions = [eq(schema.tasks.orgId, ctx.orgId)];
  if (input.projectId) baseConditions.push(eq(schema.tasks.projectId, input.projectId));

  const tasks = await (async () => {
    if (ctx.actor.role === "employee") {
      return db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          status: schema.tasks.status,
          dueDate: schema.tasks.dueDate,
        })
        .from(schema.tasks)
        .innerJoin(
          schema.projectAssignments,
          eq(schema.projectAssignments.projectId, schema.tasks.projectId),
        )
        .where(
          and(...baseConditions, eq(schema.projectAssignments.userId, ctx.actor.userId)),
        );
    }
    if (ctx.actor.role === "customer") {
      return db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          status: schema.tasks.status,
          dueDate: schema.tasks.dueDate,
        })
        .from(schema.tasks)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.tasks.projectId))
        .where(and(...baseConditions));
    }
    // admin
    return db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        status: schema.tasks.status,
        dueDate: schema.tasks.dueDate,
      })
      .from(schema.tasks)
      .where(and(...baseConditions));
  })();

  const taskIds = tasks.map((t) => t.id);
  if (taskIds.length === 0) return ok([]);

  // Assignees per task.
  const assigneeRows = await db
    .select({
      taskId: schema.taskAssignments.taskId,
      userId: schema.taskAssignments.userId,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.taskAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.taskAssignments.userId))
    .where(inArray(schema.taskAssignments.taskId, taskIds));

  // Comment counts: count comments on daily updates linked to each task.
  const commentRows = await db
    .select({
      taskId: schema.dailyUpdateTaskLinks.taskId,
      id: schema.comments.id,
    })
    .from(schema.comments)
    .innerJoin(
      schema.dailyUpdateTaskLinks,
      eq(schema.dailyUpdateTaskLinks.dailyUpdateId, schema.comments.dailyUpdateId),
    )
    .where(inArray(schema.dailyUpdateTaskLinks.taskId, taskIds));

  // Time-entry totals.
  const timeRows = await db
    .select({ taskId: schema.timeEntries.taskId, minutes: schema.timeEntries.minutes })
    .from(schema.timeEntries)
    .where(inArray(schema.timeEntries.taskId, taskIds));

  // Attachments.
  const attachmentRows = await db
    .select({ taskId: schema.attachments.parentId, id: schema.attachments.id })
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.parentType, "task"),
        inArray(schema.attachments.parentId, taskIds),
        eq(schema.attachments.status, "ready"),
      ),
    );

  // Last activity snippet: most recent daily update body per task.
  const updateRows = await db
    .select({
      taskId: schema.dailyUpdateTaskLinks.taskId,
      body: schema.dailyUpdates.body,
      createdAt: schema.dailyUpdates.createdAt,
      visibility: schema.dailyUpdates.visibility,
    })
    .from(schema.dailyUpdates)
    .innerJoin(
      schema.dailyUpdateTaskLinks,
      eq(schema.dailyUpdateTaskLinks.dailyUpdateId, schema.dailyUpdates.id),
    )
    .where(inArray(schema.dailyUpdateTaskLinks.taskId, taskIds))
    .orderBy(desc(schema.dailyUpdates.createdAt));

  // Customer-visibility filter on snippet.
  const visibleUpdateRows =
    ctx.actor.role === "customer"
      ? updateRows.filter((u) => u.visibility === "customer_visible")
      : updateRows;

  // Aggregate per task.
  const assigneesByTask = new Map<string, { id: string; name: string | null; email: string }[]>();
  for (const a of assigneeRows) {
    const arr = assigneesByTask.get(a.taskId) ?? [];
    arr.push({ id: a.userId, name: a.name, email: a.email });
    assigneesByTask.set(a.taskId, arr);
  }
  const commentCountByTask = new Map<string, number>();
  for (const c of commentRows) {
    commentCountByTask.set(c.taskId, (commentCountByTask.get(c.taskId) ?? 0) + 1);
  }
  const minutesByTask = new Map<string, number>();
  for (const t of timeRows) {
    minutesByTask.set(t.taskId, (minutesByTask.get(t.taskId) ?? 0) + t.minutes);
  }
  const attachmentCountByTask = new Map<string, number>();
  for (const a of attachmentRows) {
    attachmentCountByTask.set(a.taskId, (attachmentCountByTask.get(a.taskId) ?? 0) + 1);
  }
  const latestUpdateByTask = new Map<string, { body: string; createdAt: Date }>();
  for (const u of visibleUpdateRows) {
    if (!latestUpdateByTask.has(u.taskId)) {
      latestUpdateByTask.set(u.taskId, { body: u.body, createdAt: u.createdAt });
    }
  }

  const result: TaskCardRow[] = tasks.map((t) => {
    const latest = latestUpdateByTask.get(t.id);
    return {
      id: t.id,
      title: t.title,
      status: t.status as TaskStatus,
      dueDate: t.dueDate ?? null,
      lastActivitySnippet: latest?.body ?? null,
      lastActivityAt: latest?.createdAt ?? null,
      commentCount: commentCountByTask.get(t.id) ?? 0,
      totalMinutes: minutesByTask.get(t.id) ?? 0,
      attachmentCount: attachmentCountByTask.get(t.id) ?? 0,
      assignees: assigneesByTask.get(t.id) ?? [],
    };
  });

  return ok(result);
}
```

Re-export from `lib/services/tasks/index.ts`:

```ts
// Update the existing re-export line from Task 3 to also include listTasksWithCardData:
export {
  listActivityForTask,
  listRecentActivity,
  listTasksWithCardData,
  type ActivityEvent,
  type TaskCardRow,
} from "./activity";
```

Add server-action wrappers. In `lib/server-actions/tasks.ts`:

```ts
export async function listTasksWithCardDataAction(input: { projectId?: string } = {}) {
  return withSessionContext((db, ctx) => tasks.listTasksWithCardData(db, ctx, input));
}
```

In `lib/server-actions/admin/tasks.ts`:

```ts
export async function adminListTasksWithCardDataAction(
  orgId: string,
  input: { projectId?: string } = {},
) {
  return withSessionContext(
    (db, ctx) => tasks.listTasksWithCardData(db, ctx, input),
    { staffOrgId: orgId },
  );
}
```

#### Step 2: Project pages × 3 (use TaskCard)

For each of the three project pages, read the existing file, then replace the "Tasks" section's task-card rendering with the new `TaskCard` component.

**Customer:** `app/customer/projects/[projectId]/page.tsx` — find the section that renders tasks. Replace the inline rendering with:

```tsx
import { TaskCard } from "@/components/app/task-card";
import { listTasksWithCardDataAction } from "@/lib/server-actions/tasks";

// ... inside the component, after the project fetch:
const tasksR = await listTasksWithCardDataAction({ projectId });
const tasks = tasksR.ok ? tasksR.data : [];

// In the JSX, replace the existing task list block with:
<section>
  <h2 className="mb-3 text-lg font-medium">Tasks</h2>
  {tasks.length === 0 ? (
    <p className="text-sm text-slate-500">No tasks yet.</p>
  ) : (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} href={`/customer/tasks/${t.id}`} />
      ))}
    </div>
  )}
</section>
```

**Employee:** `app/employee/projects/[projectId]/page.tsx` — same substitution; href is `/employee/tasks/${t.id}`. ALSO remove the inline `TaskStatusChanger` rendering from this page (it now lives inside the task detail page's action bar).

**Admin:** `app/admin/orgs/[orgId]/projects/[projectId]/page.tsx` — use `adminListTasksWithCardDataAction(orgId, { projectId })`; href is `/admin/orgs/${orgId}/tasks/${t.id}`.

#### Step 3: Employee tasks list page

`app/employee/tasks/page.tsx` — use `listTasksWithCardDataAction({})` (no projectId filter) and `TaskCard` rendering, keeping the existing filter pills. Update the href to `/employee/tasks/${t.id}`.

#### Step 4: Layout nav polish — pair nav links with icons

For each of `app/customer/layout.tsx`, `app/employee/layout.tsx`, and `app/admin/orgs/[orgId]/layout.tsx`, update the nav block. Customer:

```tsx
import { LayoutDashboard, FolderKanban, FilePlus2, Bell } from "lucide-react";

// Replace the existing <nav> ... </nav> children with:
<nav aria-label="Main" className="flex items-center gap-4 text-sm">
  <Link href="/customer/dashboard" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <LayoutDashboard className="h-4 w-4" />
    Dashboard
  </Link>
  <Link href="/customer/projects" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <FolderKanban className="h-4 w-4" />
    Projects
  </Link>
  <Link href="/customer/requests" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <FilePlus2 className="h-4 w-4" />
    Requests
  </Link>
</nav>
```

Employee:

```tsx
import { LayoutDashboard, FolderKanban, CheckSquare, Clock } from "lucide-react";

<nav aria-label="Main" className="flex items-center gap-4 text-sm">
  <Link href="/employee/dashboard" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <LayoutDashboard className="h-4 w-4" />
    Dashboard
  </Link>
  <Link href="/employee/projects" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <FolderKanban className="h-4 w-4" />
    Projects
  </Link>
  <Link href="/employee/tasks" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <CheckSquare className="h-4 w-4" />
    My tasks
  </Link>
  <Link href="/employee/time" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <Clock className="h-4 w-4" />
    Time
  </Link>
</nav>
```

Admin (per-org layout):

```tsx
import { LayoutDashboard, FolderKanban, Inbox } from "lucide-react";

<nav aria-label="Admin" className="flex items-center gap-4 text-sm">
  <Link href={`/admin/orgs/${orgId}/dashboard`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <LayoutDashboard className="h-4 w-4" />
    Dashboard
  </Link>
  <Link href={`/admin/orgs/${orgId}/projects`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <FolderKanban className="h-4 w-4" />
    Projects
  </Link>
  <Link href={`/admin/orgs/${orgId}/work-requests`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900">
    <Inbox className="h-4 w-4" />
    Work requests
  </Link>
</nav>
```

Brand-color sweep: in the three layouts, find any `text-blue-600` or `border-blue-500` references and replace with the indigo variant (`text-indigo-600`, `border-indigo-500`). Same for filter pills on pages that use them (`app/employee/tasks/page.tsx`, `app/admin/orgs/[orgId]/work-requests/page.tsx`). This is a search-and-replace pass — verify visually by running `pnpm dev` and clicking through after.

#### Step 5: Playwright E2E

Create `tests/e2e/task-detail.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("employee opens task detail and posts an update", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "employee@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/employee\/dashboard$/);

  // Open My tasks, click into the seeded "E2E task".
  await page.click('a:has-text("My tasks")');
  await expect(page).toHaveURL(/\/employee\/tasks/);
  await page.click('text=E2E task');
  await expect(page).toHaveURL(/\/employee\/tasks\/[^/]+$/);

  // Activity feed should render the empty state initially.
  await expect(page.getByText(/No activity yet/i)).toBeVisible();

  // Open "Post update" composer.
  await page.click('button:has-text("Post update")');
  await page.fill("textarea#update-body", "First update from the task detail");
  await page.click('button:has-text("Post update")');

  // The new update appears in the feed.
  await expect(page.getByText("First update from the task detail")).toBeVisible();
});
```

#### Step 6: Verify everything

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Expected: typecheck/lint clean. Vitest count: 217 (prior) + 5 (Task 3 activity tests) = 222 passing. E2E: 7 (prior) + 1 (new) = 8 passing (+ 1 skipped for R2-gated attachment test).

#### Step 7: Commit

```bash
git add lib/services/tasks/activity.ts lib/services/tasks/index.ts lib/server-actions/tasks.ts lib/server-actions/admin/tasks.ts \
  "app/customer/projects/[projectId]/page.tsx" \
  "app/employee/projects/[projectId]/page.tsx" \
  "app/employee/tasks/page.tsx" \
  "app/admin/orgs/[orgId]/projects/[projectId]/page.tsx" \
  app/customer/layout.tsx app/employee/layout.tsx "app/admin/orgs/[orgId]/layout.tsx" \
  tests/e2e/task-detail.spec.ts

git commit -m "feat(5a): TaskCard rollout + nav icons + listTasksWithCardData + E2E"
```

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-16-ux-redesign-tasks-as-posts.md` — Sub-plan 5a section):

- Geist font + ThemeProvider scaffold — Task 1 ✓
- Indigo primary — Task 1 (CSS variable wiring) + Task 11 (replace blue references) ✓
- Status constants module — Task 1 ✓
- Avatar + AvatarStack — Task 2 ✓
- StatusPill (TaskStatusPill + WorkRequestStatusPill) — Task 2 ✓
- EmptyState (icon variant) — Task 2 ✓
- PageHeader — Task 2 ✓
- ActivityFeed (server component) — Task 4 ✓
- listActivityForTask service + listRecentActivity — Task 3 ✓
- Server-action wrappers (per-role + admin) — Task 3 ✓
- TaskCard component — Task 6 ✓
- Customer task detail page — Task 7 ✓
- Employee task detail page — Task 8 ✓
- Admin task detail page — Task 9 ✓
- Dashboard activity feeds × 3 — Task 10 ✓
- Project pages × 3 use TaskCard — Task 11 ✓
- Tasks list × 2 use TaskCard — Task 11 ✓
- Layout nav with icons — Task 11 ✓

**Placeholder scan:** No "TBD" / "TODO" / "Similar to Task N" anywhere. Every code step has full code.

**Type consistency:**
- `TaskStatus` defined in `lib/constants/status.ts` (Task 1), referenced in: status pill component (Task 2), ActivityEvent type (Task 3), ActivityFeedEvent (Task 4), TaskActionBar (Task 5), TaskCard (Task 6), all task detail pages (Tasks 7-9), TaskCardRow (Task 11). Single source of truth — no drift.
- `ActivityEvent` discriminated union: defined in `lib/services/tasks/activity.ts` (Task 3), re-exported from `lib/services/tasks/index.ts` (Task 3), consumed by ActivityFeed + ActivityFeedEvent (Task 4) and by the dashboards (Task 10).
- `TaskCardData` (component prop type, Task 6) and `TaskCardRow` (service return shape, Task 11) — these are intentionally separate. The Task 11 implementer must map `TaskCardRow` → `TaskCardData` when rendering — they have the same shape but live on opposite sides of the service boundary. Marked here explicitly to avoid a "rename one" refactor mid-execution.
- All Server Action wrappers consistently take their own input types from the service module.

**Architectural notes:**
- The ActivityFeed's empty state in Task 4 is intentionally minimal ("No activity yet."); the richer `EmptyState` component (Task 2) is reserved for page-level empty states (no projects, no tasks, etc.), used in 5b.
- The `taskHrefFor` callback prop on ActivityFeed lets the same feed render in both per-task pages (where it's omitted) and dashboards (where it produces role-scoped task-detail URLs). Avoids a "role" prop with role-aware URL construction inside the component.
- TaskActionBar's `canX` flags allow gradual permission rollout per role. Customer detail (Task 7) sets all false → action bar doesn't render. Employee + admin (Tasks 8-9) set all true.
- ActivityFeedEvent's per-kind switch is intentionally NOT extracted into per-kind components for 5a. Inline switch keeps the rendering in one place and lets 5b add new fields (sub-comments, reactions, edit affordance) by editing one file. If the file grows past ~250 LOC during 5b, the implementer should split it then.

**Architectural decisions baked in:**
- Activity events for the dashboard come from a single `listRecentActivity` call (not five separate fetches). Ordering and slicing happen in-memory.
- Customer visibility filter (internal_only updates) is applied at the service layer, not the component layer. This guarantees the customer never receives internal data over the wire.
- The task detail pages do NOT include an inline daily-update detail link from each update — for now, the user reads the update inline. The standalone update detail page stays for direct linking and comment threads. 5b adds inline editing affordances.
- The "blue → indigo" sweep in Task 11 is a focused search-and-replace pass. It touches layout files and the two filter-pill pages. The implementer should grep for `text-blue-` and `border-blue-` and replace narrowly — no broader refactoring.
