# UX Redesign Spec: Tasks-as-Posts + Visual Polish

**Date:** 2026-05-16
**Status:** Draft (awaiting user review)
**Replaces:** Phase 1 UI as shipped through Plan 4. This spec covers Plan 5.

## Goal

Two related upgrades that ship together:

1. **Structural** — reorganize task & update presentation around a "task-as-post, activity-as-thread" model. Tasks become the primary unit; daily updates, status changes, time logs, comments, and attachments display as a chronological feed underneath each task.
2. **Visual** — modernize the visual language across the whole app: typography upgrade, refined primary color, avatars in feeds, card style refresh, friendlier empty states, consistent spacing rhythm. The current UI looks like raw shadcn defaults; this brings it closer to Linear / GitHub Issues / Vercel-dashboard polish.

## Non-goals

- No schema changes. The existing tables (`tasks`, `daily_updates`, `daily_update_task_links`, `task_status_log`, `time_entries`, `comments`, `attachments`) already model everything we need.
- No service-layer changes beyond adding **one** aggregator function: `listActivityForTask(taskId)` that returns interleaved events. Server actions, auth, validation, role split all stay.
- No marketing-page redesign. App-internal screens only.
- No dark mode (Phase 2).
- No custom illustrations — empty states use icons + copy only.
- Customers do not gain the ability to comment on tasks directly. They keep commenting on individual updates as today, and those comments render nested under the parent update in the task feed.

## Visual design tokens

### Typography

- **Font:** `Geist Sans` via `next/font/google` — replaces the default system font stack. Geist is free, has a wide weight range, and reads cleanly at small sizes. Apply in `app/layout.tsx`.
- **Scale (Tailwind classes already cover this):**
  - `text-xs` (12px) — secondary metadata (timestamps, counts)
  - `text-sm` (14px) — body copy, list items
  - `text-base` (16px) — emphasized body (task descriptions)
  - `text-lg` (18px) — section headings
  - `text-xl` (20px) — page H1 for nested pages
  - `text-2xl` (24px) — page H1 for top-level pages
- **Weights:** 400 (default), 500 (medium — section headings, emphasized labels), 600 (semibold — H1 only).
- **Line height:** rely on Tailwind's default leading-normal for body, leading-tight for headings.

### Color

- **Primary** stays in the same hue family but shifts from generic blue to `indigo-600` for buttons/links/active filter pills. Hover `indigo-700`. Subtle background `indigo-50`.
- **Neutrals:** keep `slate-*` (already in use). Standardize on `slate-50` (page bg), `white` (cards), `slate-100` (subtle dividers), `slate-200` (borders), `slate-500` (muted text), `slate-700` (body text), `slate-900` (headings).
- **Status colors** (defined once, reused everywhere — extracted into a constants module):
  - `todo` → slate
  - `in_progress` → indigo
  - `blocked` → amber
  - `done` → emerald
  - `cancelled` → slate (muted)
  - `submitted` (work request) → indigo
  - `accepted` → emerald
  - `rejected` → rose
  - `duplicate` → slate
- **Pill style** (replaces current Badge variants — see Avatar/Pill section).

### Spacing & rhythm

- Page padding: `p-6` (existing).
- Section spacing: `space-y-6` between major sections, `space-y-3` within a section.
- Card padding: `p-4` for content cards, `p-3` for compact list cards.
- Standardize on `rounded-lg` (8px) for cards, `rounded-md` (6px) for buttons/inputs (existing), `rounded-full` for avatars + filter pills.
- Card elevation: `shadow-sm` + `border border-slate-200` for content cards. Hover `shadow-md` for interactive cards (project cards, task cards). No shadow for nested list items.

### Avatars

New component `components/ui/avatar.tsx`:

- Renders initials from a user's name (first letter of first two words; falls back to first letter of email if no name).
- Background color deterministically picked from a small palette (8 tints — indigo, emerald, amber, rose, sky, violet, fuchsia, teal) keyed off a hash of `userId`.
- Sizes: `xs` (20px), `sm` (24px), `md` (32px), `lg` (40px). Defaults to `sm`.
- Used in: activity feed (author of each event), task cards (assignee avatars), header (logged-in user), comment thread.

### Icons

- Already using `lucide-react`. Extend usage:
  - Activity feed event icons: `MessageCircle` (comment/update), `CircleCheck` (status done), `CircleDot` (status in_progress), `Clock` (time log), `Paperclip` (attachment).
  - Empty states: relevant lucide icon + friendly copy + primary action button.
  - Nav items: pair each nav link with an icon (`LayoutDashboard`, `FolderKanban`, `CheckSquare`, `Clock`, etc.).

### Empty states

A reusable `components/app/empty-state.tsx`:

```
┌─────────────────────────────────────┐
│              [icon]                 │
│         "No tasks yet"              │
│   "When you're assigned to a task,  │
│    it will show up here."           │
│         [primary action]            │
└─────────────────────────────────────┘
```

Replaces the current bare `<p>No tasks yet.</p>` lines.

## Components (new + revised)

### `components/app/activity-feed.tsx` (new, server component)

Aggregates events for a task and renders them chronologically.

**Props:** `{ taskId: string; canPostUpdate: boolean; canLogTime: boolean }`.

**Events:**
- `update` — daily update linked to this task (renders body, author avatar+name, timestamp, nested comments)
- `status_change` — one-line event with old/new status + actor + timestamp
- `time_log` — one-line event with minutes + actor + timestamp + optional note
- `comment` — comment on a daily update (rendered as a reply under the parent update)
- `attachment` — file upload (renders file row with download link)

**Layout:** vertical timeline. Each event has a 24px icon column on the left + content + timestamp on the right. Daily updates and attachments use a card-like container; status/time-log/comment events are single-line.

### `components/app/task-card.tsx` (revised)

Replaces the current bare `<Card>` rendering in project pages and tasks list. New layout:

```
┌─────────────────────────────────────────────────────┐
│ ● In Progress    Build the new pricing page      → │
│                                                     │
│ "Got wireframes from design. Starting hero…" 2d ago │
│                                                     │
│ 👥 [AB][CD]   💬 3   ⏱ 4h 30m   📎 2  ·  Due Apr 25 │
└─────────────────────────────────────────────────────┘
```

- Header row: status pill (left) · title (truncate) · arrow icon (right).
- Last activity snippet (truncated to 1 line).
- Meta row: assignee avatars (stacked, max 3 + "+N"), comment count, time logged, attachment count, due date.
- Hover: subtle shadow lift.
- Click → task detail page.

### `components/app/post-update-form.tsx` (revised from existing `daily-update-form.tsx`)

The daily update form is repurposed:
- When opened from a task detail page, the task is pre-linked (hidden from the form).
- Activity type selector hidden by default; advanced fields collapsed under a "More options" disclosure.
- Visibility defaults to "customer_visible" (unchanged).
- Submit posts the update and updates the task feed in place via `router.refresh()`.

### `components/app/page-header.tsx` (new)

Small reusable component for consistent page H1 + optional subtitle + optional right-side action button. Replaces the current ad-hoc `<div className="flex justify-between"><h1>…</h1><Link>+ New</Link></div>` in every page.

### `components/ui/avatar.tsx` (new)

See Avatars section above. Pure presentational.

### `components/ui/status-pill.tsx` (new)

Standardized pill rendering for task statuses + work-request statuses. Replaces inline `<Badge variant=…>` calls scattered through pages.

### Deletes / replaces

- `components/app/daily-update-card.tsx` — folded into `ActivityFeed`'s update-event rendering. Kept as a thin wrapper if customer-facing pages still need it standalone.
- Inline status-label maps and status-variant maps from many pages — extracted into `lib/constants/status.ts`.

## Routes

### New

- `/customer/tasks/[taskId]` — task detail (read-only for customer + comment-on-update only).
- `/employee/tasks/[taskId]` — task detail (post update, log time, change status).
- `/admin/orgs/[orgId]/tasks/[taskId]` — task detail (everything employees can do + reassign + edit task fields).

### Revised

- **Project detail pages (3 roles):** replace the inline task list with the new `TaskCard` style. Each card clicks into the task detail page (no more inline status changer dropdown — that moves into the task detail page action bar).
- **Tasks list pages (employee, admin):** same `TaskCard` style, filter pills row at top stays.
- **Dashboards (3 roles):** "Recent activity" section replaces "Open tasks" + "Recent updates". Shows a unified feed of events on tasks the user is involved in (assignee, project member, or org admin). Quick actions row above (Post update / Log time / New project, role-dependent).
- **Daily update detail pages (customer + employee):** add a back-link to the parent task at the top. Otherwise unchanged.

### Unchanged

- Login, signup, magic link, reset.
- Work request submission + review pages (the task-as-post applies to *tasks*; work requests stay as today, but accept-and-create-task → the resulting task is a "post").
- Notifications pages.
- Project create form.
- Admin team manager.

## Service-layer change

One new function: `listActivityForTask(db, ctx, taskId): Promise<Result<ActivityEvent[]>>` in `lib/services/tasks/index.ts`. Aggregates from four sources in parallel:

- `daily_updates` joined to `daily_update_task_links` where `taskId = $1`
- `task_status_log` where `taskId = $1`
- `time_entries` where `taskId = $1`
- `comments` joined to `daily_updates` via `daily_update_id`, where the daily update is linked to the task
- `attachments` where `parent_type = 'task' AND parent_id = $1`

Sorted by event timestamp ascending (oldest first; activity reads top-to-bottom like a thread). Each event has a discriminated `kind` field. Auth: re-uses `requireTaskRead`.

Server action wrapper: `getTaskActivityAction(orgIdOrPositional)` in the appropriate role-scoped wrapper (employee, admin) and a customer variant.

## Page-by-page change list

| Page | Change |
|---|---|
| `app/layout.tsx` | Add Geist font via next/font/google, update body class |
| `app/globals.css` | Replace primary `--brand` references (if any) with indigo; add tokens for status colors |
| `app/customer/dashboard/page.tsx` | New "Recent activity" section feed; remove "Recent updates" cards block |
| `app/customer/projects/[projectId]/page.tsx` | Replace inline tasks list with `TaskCard` rendering, click → `/customer/tasks/[id]` |
| `app/customer/tasks/[taskId]/page.tsx` | New — task detail with `ActivityFeed` |
| `app/customer/projects/[projectId]/updates/[updateId]/page.tsx` | Add back-link to parent task |
| `app/employee/dashboard/page.tsx` | New "Recent activity" feed |
| `app/employee/projects/[projectId]/page.tsx` | Use `TaskCard`; remove inline status changer |
| `app/employee/tasks/[taskId]/page.tsx` | New |
| `app/employee/tasks/page.tsx` | Use `TaskCard` |
| `app/admin/orgs/[orgId]/dashboard/page.tsx` | New activity feed alongside KPI cards |
| `app/admin/orgs/[orgId]/projects/[projectId]/page.tsx` | Use `TaskCard` |
| `app/admin/orgs/[orgId]/tasks/[taskId]/page.tsx` | New |
| All layouts | Update header chrome — pair nav items with icons, polish typography |

## Scope estimate

**Plan 5 (UX Redesign):** roughly 12–14 tasks.

1. Visual foundation: font, primary color, status constants, avatar component, status pill component (1 task)
2. Empty state component + page header component (1 task)
3. ActivityFeed component + listActivityForTask service + server actions (2 tasks)
4. TaskCard component (1 task)
5. Task detail page × 3 roles (3 tasks — one per role)
6. Dashboard redesigns × 3 roles (3 tasks)
7. Project detail page updates × 3 roles (1 combined task)
8. Tasks list page updates × 2 (employee + admin) (1 combined task)
9. Layout/nav polish (1 task)
10. Final verification (1 task)

**Plan 6 (Deploy):** deployment work, separate plan after Plan 5 lands.

## Out of scope (deliberate)

- Dark mode (Phase 2).
- Custom illustrations (icon-only empty states).
- Avatar image uploads (initials-only).
- Real-time activity updates via websockets (page is dynamic; refresh on action).
- Customer commenting on tasks directly (still on updates).
- Editing existing daily updates from the task feed (still via update detail page).
- Inline emoji reactions / threaded sub-comments.
- Mobile-specific layouts (responsive but not mobile-first).
- Search.

## Risks & open notes

- Geist font adds ~50KB of font assets. Acceptable for a desktop-first app.
- `listActivityForTask` issues 4–5 small queries per call. For Phase 1's data volume this is fine; if a task accumulates hundreds of events, we'd add pagination in Phase 2.
- The visual polish touches every page. Reviewers should sanity-check that the existing role-gating and auth behavior are preserved across edits.
