# UX Redesign Spec: Tasks-as-Posts + Full Visual & Interaction Refresh

**Date:** 2026-05-16
**Status:** Draft (awaiting user review)
**Replaces:** Phase 1 UI as shipped through Plan 4. This spec covers Plan 5, decomposed into 5a / 5b / 5c.

## Goal

A comprehensive UX redesign that ships as three sub-plans:

- **5a — Visual foundation & tasks-as-posts.** Typography, color, avatars, status pills, empty states. Tasks become the primary "post"; activity (updates, status changes, time logs, comments, attachments) shows as a chronological thread underneath. New task detail page per role.
- **5b — Interactions & polish.** Dark mode, mobile-first responsive layouts, avatar image uploads, custom SVG illustrations for empty states, in-feed daily-update editing, customer commenting on tasks directly (polymorphic comments), threaded sub-comments, emoji reactions on comments.
- **5c — Search & realtime.** Postgres full-text search across tasks / updates / work requests, search page + header input. Realtime activity feed and notifications via Postgres `LISTEN`/`NOTIFY` + Server-Sent Events streaming endpoint.

Each sub-plan is independently shippable in that order. 5a delivers value alone; 5b is polish on top of 5a; 5c is the live-collaboration layer.

## Non-goals

- No third-party realtime service (Pusher, Liveblocks, Ably). We use Postgres LISTEN/NOTIFY + Server-Sent Events. This works in any environment that supports a long-running connection to Postgres; on serverless (Vercel) the SSE connection reconnects every ~5 min.
- No native mobile app. Responsive web only.
- No internationalization (Phase 2).
- No marketing-page redesign. App-internal screens only.
- No real-time presence indicators ("X is typing"). Phase 2 if ever.

---

## Sub-plan 5a: Visual foundation & tasks-as-posts

### Visual design tokens

#### Typography

- **Font:** `Geist Sans` via `next/font/google` — replaces system stack. Geist is free, has a wide weight range, reads cleanly at small sizes.
- **Scale (Tailwind):**
  - `text-xs` (12px) — secondary metadata (timestamps, counts)
  - `text-sm` (14px) — body copy, list items
  - `text-base` (16px) — emphasized body (task descriptions)
  - `text-lg` (18px) — section headings
  - `text-xl` (20px) — page H1 nested
  - `text-2xl` (24px) — page H1 top-level
- **Weights:** 400 default, 500 medium (headings, emphasized labels), 600 semibold (H1 only).

#### Color (light mode; dark mode in 5b)

CSS-variable-based tokens defined in `app/globals.css` and consumed by Tailwind via the `[data-theme=…]` selector. Light values shown here; dark values in 5b.

- **Primary:** `--brand` = indigo-600. Hover indigo-700. Subtle bg indigo-50.
- **Neutrals:** slate scale stays. `slate-50` page bg, `white` cards, `slate-100` subtle dividers, `slate-200` borders, `slate-500` muted text, `slate-700` body, `slate-900` headings.
- **Status colors** (centralized in `lib/constants/status.ts`):
  - `todo` → slate
  - `in_progress` → indigo
  - `blocked` → amber
  - `done` → emerald
  - `cancelled` → slate (muted)
  - `submitted` → indigo · `accepted` → emerald · `rejected` → rose · `duplicate` → slate

#### Spacing & elevation

- Page padding `p-6`, section spacing `space-y-6`, intra-section `space-y-3`, card padding `p-4` (content) / `p-3` (compact).
- Radii: `rounded-lg` (8px) cards, `rounded-md` (6px) buttons/inputs, `rounded-full` avatars + filter pills.
- Cards: `shadow-sm` + `border border-slate-200`. Interactive cards lift to `shadow-md` on hover. Nested list items have no shadow.

### New components

#### `components/ui/avatar.tsx`

Initials avatar — first letter of first two words of `name`, falling back to first letter of `email`. Background color deterministic from `userId` hash, picked from an 8-tint palette (indigo, emerald, amber, rose, sky, violet, fuchsia, teal). Sizes: `xs` 20px, `sm` 24px, `md` 32px, `lg` 40px. Default `sm`. 5b extends to render `users.image` if present, with the initials as fallback.

#### `components/ui/status-pill.tsx`

Replaces inline `<Badge variant=…>` for task and work-request statuses. Reads from `lib/constants/status.ts`. Renders a small rounded-full badge with `bg-<color>-50 text-<color>-700 border border-<color>-200`.

#### `components/app/empty-state.tsx`

Reusable empty-state with icon (5a) → swapped for SVG illustration in 5b. Props: `{ icon, title, description, action? }`.

#### `components/app/page-header.tsx`

Page H1 + optional subtitle + optional right-side action button. Replaces ad-hoc flex headers across pages.

#### `components/app/activity-feed.tsx` (server component)

Aggregates events for a task and renders chronologically. **Props:** `{ taskId: string; canPostUpdate: boolean; canLogTime: boolean; canChangeStatus: boolean; canEditUpdate: boolean }`. Five event kinds:

- `update` — daily update linked to this task; renders body, author avatar+name, timestamp, nested comments + (5b) sub-comments + (5b) reactions + (5b) edit affordance.
- `status_change` — single-line event ("Alice changed status: To Do → In Progress · 2d ago").
- `time_log` — single-line event with formatted minutes + actor + optional note.
- `comment` — comment from `comments` table; renders under the parent update (or, in 5b, directly on the task if `parent_type = 'task'`).
- `attachment` — file row with download link + uploader avatar.

Layout: vertical timeline with a 24px icon column on the left. Updates use a card-like container; status / time-log / single comments use a single-line layout.

Bottom action bar with `Post update` / `Log time` / `Change status` / `Attach` buttons gated by the prop flags.

#### `components/app/task-card.tsx`

Replaces inline task `<Card>` rendering. Layout:

```
┌─────────────────────────────────────────────────────┐
│ ● In Progress    Build the new pricing page      → │
│ "Got wireframes from design. Starting hero…" 2d ago │
│ 👥 [AB][CD]   💬 3   ⏱ 4h 30m   📎 2  ·  Due Apr 25 │
└─────────────────────────────────────────────────────┘
```

- Status pill · title (truncated) · arrow icon
- Last-activity snippet (1 line, truncated)
- Meta row: assignee avatar stack (max 3 + "+N"), comment count, time logged, attachment count, due date.
- Hover: shadow-md lift. Click → task detail page.

#### `components/app/post-update-form.tsx`

Repurposes the existing `daily-update-form.tsx`. When opened from a task detail page, the task is pre-linked. Activity-type selector hidden by default; advanced fields collapsed under "More options". Visibility defaults to `customer_visible`. Submit posts the update and refreshes the feed via `router.refresh()`.

### Service-layer change

One new function in `lib/services/tasks/index.ts`:

```ts
listActivityForTask(db, ctx, taskId): Promise<Result<ActivityEvent[]>>
```

Aggregates from five sources in parallel (or three queries with UNION) — daily updates joined via `daily_update_task_links`, status log, time entries, comments joined to those updates, attachments where `parent_type = 'task'`. Sorted by event timestamp ascending. Auth: `requireTaskRead`.

Server-action wrappers: `getTaskActivityAction` per role (customer / employee / admin variant).

### New routes (5a)

- `/customer/tasks/[taskId]` — read-only feed + comment-on-update.
- `/employee/tasks/[taskId]` — full action bar (post update, log time, change status).
- `/admin/orgs/[orgId]/tasks/[taskId]` — full action bar + task field editing (title, description, due date, assignees).

### Revised pages (5a)

| Page | Change |
|---|---|
| `app/layout.tsx` | Add Geist font, wrap in `ThemeProvider` (prepared for 5b dark mode) |
| `app/globals.css` | Brand color tokens, status color CSS variables |
| `app/customer/dashboard/page.tsx` | "Recent activity" feed replaces "Open tasks + Recent updates" |
| `app/customer/projects/[projectId]/page.tsx` | TaskCard rendering, click → task detail |
| `app/customer/projects/[projectId]/updates/[updateId]/page.tsx` | Back-link to parent task |
| `app/employee/dashboard/page.tsx` | Activity feed |
| `app/employee/projects/[projectId]/page.tsx` | TaskCard, removes inline status changer |
| `app/employee/tasks/page.tsx` | TaskCard rendering |
| `app/admin/orgs/[orgId]/dashboard/page.tsx` | Activity feed alongside KPI cards |
| `app/admin/orgs/[orgId]/projects/[projectId]/page.tsx` | TaskCard |
| All layouts | Pair nav items with lucide icons |

### 5a tasks (estimate: ~10 tasks)

1. Foundation: Geist font, indigo primary, status constants module, ThemeProvider scaffold (1)
2. UI primitives: Avatar (initials), StatusPill, EmptyState (icon variant), PageHeader (1)
3. ActivityFeed component + listActivityForTask service + server actions (2)
4. TaskCard component (1)
5. Task detail page — customer (1)
6. Task detail page — employee (1)
7. Task detail page — admin (1)
8. Dashboard activity feed × 3 roles (1)
9. Project + tasks list pages refresh × 3 roles, layout nav polish (1)

---

## Sub-plan 5b: Interactions & polish

### Dark mode

- `next-themes` is already in `package.json`. Wrap `app/layout.tsx` in `ThemeProvider attribute="class"`.
- Add `components/ui/theme-toggle.tsx` — sun/moon icon button placed in the header next to the user name.
- Dark palette via Tailwind's `dark:` variant + CSS variables in `app/globals.css`:
  - bg: slate-50 → slate-900 (page), white → slate-800 (cards)
  - text: slate-700 → slate-200, slate-900 → slate-50
  - borders: slate-200 → slate-700
  - primary: indigo-600 → indigo-500 (slightly brighter for dark bg contrast)
- Status pills use Tailwind `dark:` variants of the same hue.
- All custom shadows reduced or replaced with border-only treatment in dark mode (shadows on dark backgrounds disappear).
- Theme defaults to system preference, persisted to localStorage.

### Mobile responsiveness

- Header: hamburger menu trigger below `md:` breakpoint. Hidden nav links collapse into a sheet (use `@base-ui/react` Dialog or a simple `data-state`-toggled panel).
- All page padding shrinks on small screens: `p-4 md:p-6`.
- Grid layouts collapse to single column at `sm:` breakpoint.
- Forms: inputs become `text-base` (16px) on mobile to prevent iOS auto-zoom.
- TaskCard meta row wraps to two rows on mobile.
- ActivityFeed icon column hides on `< sm`.
- Tested viewport widths in the Playwright E2E: 375px (mobile), 768px (tablet), 1024px (laptop) — single test that resizes and asserts core flows still work.

### Avatar image uploads

- New user-settings page: `/<role>/settings/profile` (one for each role; identical content gated by middleware).
- Avatar upload uses existing R2 + presigned-PUT flow. Add `'user_avatar'` to `attachmentParentTypeEnum`, with `parent_id = userId`.
- On upload confirm: write the resulting R2 key as a public-ish URL into `users.image` (the column already exists in schema).
- `Avatar` component (from 5a) first tries `image` URL, falls back to initials.
- Upload widget reuses `AttachmentUpload` with a stricter MIME whitelist (image/* only) + size cap (5 MB).
- Old avatar gets garbage-collected by extending `gcPending` to also remove orphan `user_avatar` rows (where the user's `image` URL doesn't match).

### Custom SVG illustrations for empty states

- A small set of hand-drawn-feel inline SVGs in `components/app/illustrations/`. Each is ~3–5 KB inline.
  - `empty-tasks.tsx` (a checklist with a pencil)
  - `empty-projects.tsx` (folders)
  - `empty-updates.tsx` (a notepad)
  - `empty-notifications.tsx` (a bell)
  - `empty-search.tsx` (magnifying glass) — used in 5c
  - `empty-requests.tsx` (envelope)
- Two-color line illustrations using `currentColor` so they re-tint correctly in dark mode.
- `EmptyState` component swaps from `icon` prop to `illustration` prop. Falls back to icon if illustration is not provided (preserves API for new use cases).

### In-feed daily-update editing

- "Edit" icon on each update in the activity feed, visible to the author and to admins.
- Click → inline edit mode: body becomes a Textarea, visibility/activity-type become Selects, Save / Cancel buttons.
- Uses existing `updateDailyUpdateAction`.
- On success, the activity feed refreshes via `router.refresh()`.

### Customer commenting on tasks (polymorphic comments)

- Schema migration: rename `comments.daily_update_id` → keep it AND add `comments.parent_type` text + `comments.parent_id` uuid. Existing rows: `parent_type='daily_update'`, `parent_id = daily_update_id`. The old column becomes a generated column or stays for a release cycle (we'll just keep both, leaving `daily_update_id` for backwards compat reads; new writes use `parent_type` + `parent_id`).
  - Actually simpler: drop `daily_update_id` after the migration, since this is pre-prod. Add `parent_type` + `parent_id`. Backfill old rows.
- Update services: `postComment(parentType, parentId, body)`.
- Activity feed shows task-level comments interleaved with updates as "comment" events (not nested under a specific update).
- Customer-side task detail gains an inline `<textarea> + Post comment` composer at the bottom.

### Threaded sub-comments

- Add `comments.parent_comment_id` uuid, self-referential nullable FK.
- One level of nesting only (replies to replies still go to the top-level reply).
- "Reply" affordance on each comment; opens an inline composer below.
- Sub-comments render indented (one level) under the parent.

### Emoji reactions on comments

- New `comment_reactions` table: `(comment_id, user_id, emoji)`. PK `(comment_id, user_id, emoji)`. Index on `comment_id`.
- Allowed emojis: 👍 ❤️ 🎉 ✅ 👀 🙏 (6 fixed options).
- Each comment renders existing reactions as small chips with counts; clicking toggles the current user's reaction.
- Reactions render via a client component `<ReactionBar comment={…} />` that calls `toggleReactionAction({ commentId, emoji })`.

### 5b tasks (estimate: ~12 tasks)

1. Dark mode foundation: ThemeProvider wired, dark palette CSS variables, theme toggle component (1)
2. Dark mode page-by-page sweep (verify every existing page renders cleanly in dark) (1)
3. Mobile responsive layouts: header hamburger, grid collapses, form input sizing, Playwright responsive E2E (2)
4. Avatar uploads: user_avatar parent type, upload widget, Avatar component reads users.image (1)
5. Custom SVG illustrations: 6 illustration components + EmptyState illustration prop (1)
6. User settings page × 3 roles (combined) (1)
7. Polymorphic comments: schema migration + service refactor + Plan 4 wire-up (1)
8. Task-level comments UI: composer on task detail + activity feed integration (1)
9. In-feed update editing (1)
10. Sub-comments: schema, service, UI (1)
11. Emoji reactions: schema, service, ReactionBar component, integration into comment rendering (1)

---

## Sub-plan 5c: Search & realtime

### Full-text search

- Postgres `tsvector` columns on three tables:
  - `tasks.search_vector` from `title || ' ' || coalesce(description, '')`
  - `daily_updates.search_vector` from `body`
  - `work_requests.search_vector` from `title || ' ' || coalesce(description, '')`
- All implemented as Postgres **generated** columns: `tsvector generated always as (to_tsvector('english', …)) stored`. No triggers needed; the DB keeps them in sync.
- GIN indexes on each `search_vector`.
- Service: `lib/services/search/index.ts` with `searchAll(db, ctx, query, limit)` returning a typed `SearchResult` union (`{ kind: 'task' | 'update' | 'work_request', ...row, snippet, rank }`). Auth: applies the same role-scoping each existing list service applies (tasks scoped to assigned projects for employee, etc.).
- New page `/<role>/search?q=…` shows results grouped by kind, with rank-ordered snippets (Postgres `ts_headline` for highlight).
- Header gets a search input (`Cmd/Ctrl+K` to focus). Submits to the role's search page.

### Realtime activity (SSE + Postgres LISTEN/NOTIFY)

#### How it works

- New endpoint: `app/api/events/stream/route.ts`. Returns a streaming `Response` with `Content-Type: text/event-stream`.
- On connection: opens a dedicated `pg` connection (NOT through Drizzle / Neon HTTP), issues `LISTEN crm_events`, and pipes incoming notifications to the SSE stream.
- Server-side emitters: anywhere we want to fan out an event (the `emit` function in notifications, status changes, time logs, comments) issues `NOTIFY crm_events, '<json>'`. Payload is `{ orgId, userId?, taskId?, kind: 'activity' | 'notification' }`.
- Filtering happens client-side: the subscriber knows what task / user it cares about and ignores irrelevant events.
- Client-side: a `useRealtimeActivity(taskId)` hook in the ActivityFeed component opens an `EventSource("/api/events/stream")`, listens for events matching its task, and triggers `router.refresh()` (or a more targeted re-fetch) when one arrives.
- A `useRealtimeNotifications()` hook does the same for the notifications bell.

#### Serverless considerations

- On Vercel, route handlers have a max execution time. For Pro: 300s. The SSE connection sets a server-side `setTimeout` for 280s, sends a `retry: 1000` directive before closing, prompting the client's `EventSource` to reconnect. End-user experience: seamless.
- On self-hosted (Node server) the connection stays open indefinitely.
- Falls back to per-page polling if `EventSource` errors out three times in a row.

#### Connection management

- Each SSE connection holds a dedicated `pg.Client` (NOT a pooled connection — LISTEN won't survive pool returns). Connections close when the client disconnects.
- The page reuses one EventSource across the whole tab — the connection is created in the root layout's client wrapper, and individual components subscribe via React Context.

### 5c tasks (estimate: ~10 tasks)

1. Search schema: generated tsvector columns + GIN indexes via migration (1)
2. Search service: `searchAll` with role-scoped filtering + `ts_headline` snippets (1)
3. Search server actions per role + `/<role>/search` page (1)
4. Header search input + Cmd-K shortcut (1)
5. SSE endpoint: streaming response with LISTEN on a dedicated pg.Client (1)
6. NOTIFY emitters: wire into `emit()`, status change, time log, comment post, attachment confirm (1)
7. `useRealtimeActivity` hook + ActivityFeed live refresh (1)
8. `useRealtimeNotifications` hook + bell live update (1)
9. EventSource provider in root layout + reconnect logic (1)
10. Final verification + branch wrap (1)

---

## Page-by-page change summary (across 5a/5b/5c)

| Page | 5a | 5b | 5c |
|---|---|---|---|
| `app/layout.tsx` | Font + ThemeProvider scaffold | Dark mode active | EventSource provider |
| `app/globals.css` | Light tokens | Dark tokens | (no change) |
| Customer dashboard | Activity feed | Dark mode + illustrations | Live activity |
| Customer project detail | TaskCards | (no change) | (no change) |
| Customer task detail (new) | Built | Task-level comments composer | Live activity feed |
| Customer update detail | Back-link to task | Edit-by-author inline | (no change) |
| Customer settings (new) | — | Built | (no change) |
| Customer search (new) | — | — | Built |
| Employee dashboard | Activity feed | Dark mode + illustrations | Live activity |
| Employee project detail | TaskCards | (no change) | (no change) |
| Employee task detail (new) | Built | All comment features | Live |
| Employee tasks list | TaskCards | (no change) | (no change) |
| Employee settings (new) | — | Built | (no change) |
| Employee search (new) | — | — | Built |
| Admin dashboard | Activity feed | Dark mode + illustrations | Live |
| Admin project detail | TaskCards | (no change) | (no change) |
| Admin task detail (new) | Built | All comment features + editing | Live |
| Admin work-request review | (no change) | Polished | (no change) |
| Admin settings (new) | — | Built | (no change) |
| Admin search (new) | — | — | Built |
| All layouts | Nav icons | Hamburger on mobile, theme toggle | Search bar (Cmd-K) |
| NotificationsBell | (no change) | (no change) | Live updates |

## Out-of-scope (genuinely)

- Native mobile apps.
- Internationalization.
- "X is typing…" presence indicators.
- Custom theme builder (only light/dark, no third option).
- AI features (auto-summary, smart replies, etc.).
- Email digest / batched-notification mode.
- Public API.
- Granular audit log UI.
- Bulk operations.
- Calendar / Gantt view of tasks.

## Total scope estimate

| Sub-plan | Tasks | Effort |
|---|---|---|
| 5a — Visual + tasks-as-posts | ~10 | Foundation everything else stands on |
| 5b — Interactions & polish | ~12 | Heaviest by component count |
| 5c — Search & realtime | ~10 | Smallest by count, but each task has architectural weight |
| **Total** | **~32 tasks** | Phase 1 wraps before Plan 6 (deploy) |

## Risks

- **Polymorphic comments schema migration** (5b task 7) is the only destructive change. Pre-prod, so no data preservation concern, but it does require dropping `comments.daily_update_id`. Plan to migrate Plan 4's E2E seed and any other test fixtures to the new shape in the same task.
- **SSE on Vercel serverless** with periodic reconnect introduces ~1s of "missing events" every ~5 min. Acceptable for our use case; documented in 5c.
- **Postgres LISTEN/NOTIFY with Neon HTTP**: Neon HTTP driver doesn't support LISTEN. We already use `pg` (node-postgres) for the local dev DB. Production deploy on Neon will need a separate `pg`-driver connection just for the SSE LISTEN — already in scope for 5c task 5.
- **Geist font swap** is a visible global change. Verify in light/dark + at all six text sizes before merging 5a.
- **Mobile breakpoint testing** is mostly manual; the responsive E2E (5b task 3) verifies the critical flows but doesn't catch every visual regression.
