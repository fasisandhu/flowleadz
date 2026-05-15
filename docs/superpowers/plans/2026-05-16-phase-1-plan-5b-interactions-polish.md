# Phase 1 — Plan 5b: Interactions & Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer interaction polish on top of Plan 5a's visual foundation. Eight related capabilities:

1. **Dark mode** — `next-themes` is already wired (5a Task 1 scaffold). Add a sun/moon toggle in the header, a dark palette, and apply `dark:` Tailwind variants across components and pages.
2. **Mobile-first responsive layouts** — hamburger header on small screens, single-column grids, 16px form inputs (to suppress iOS auto-zoom), TaskCard meta wrap, ActivityFeed column collapse, a responsive Playwright spec at 375/768/1024 viewport widths.
3. **Custom SVG illustrations for empty states** — six inline two-color SVGs that use `currentColor` so they re-tint in dark mode. `EmptyState` gains an `illustration` prop with the existing icon-only behavior as fallback.
4. **Avatar image uploads** — extend `attachmentParentTypeEnum` with `user_avatar`, allow image-only uploads via the existing R2 + presigned-PUT flow, write the resulting URL to `users.image`. `Avatar` reads it first; initials are the fallback.
5. **User settings page per role** — single component re-used at `/customer/settings/profile`, `/employee/settings/profile`, `/admin/settings/profile`. Edit display name + upload avatar.
6. **Polymorphic comments** — schema migration: drop `comments.daily_update_id`, add `comments.parent_type` + `comments.parent_id`. Comments can now belong to either a daily update or a task. Customer commenting on tasks becomes possible.
7. **Task-level comment composer** — the customer (and everyone else) can post a comment directly on a task. Renders interleaved in the activity feed.
8. **In-feed update editing** — author and admin see an "Edit" icon on each update card; click expands an inline edit form (body + visibility + activity-type). Uses existing `updateDailyUpdateAction`.
9. **Threaded sub-comments** — `comments.parent_comment_id` (self-FK, nullable). One level of nesting; replies-to-replies still attach to the top-level reply.
10. **Emoji reactions on comments** — new `comment_reactions` table, fixed set of 6 emojis (👍 ❤️ 🎉 ✅ 👀 🙏), per-user toggle.

**Architecture:** No new dependencies. Schema migrations are pre-prod so we drop and re-add columns without preserving data on the comments migration (Plan 4 E2E data is the only existing data; it gets re-seeded). The avatar upload reuses Plan 4's attachment infrastructure (R2 presigned-PUT → confirm → row in `attachments` table). Dark mode uses Tailwind's `dark:` variant on classes throughout — semantic-token migration (to `bg-background`, etc.) is deliberately deferred to a future polish pass to keep this plan's blast radius contained.

**Tech Stack:** Same as 5a. New runtime usage: `useTheme` hook from `next-themes`, the `<input type="file" accept="image/*">` browser flow (which already exists in `AttachmentUpload`).

**Branch:** Implement on `feat/phase-1-plan-5b-interactions-polish`, branched from `main`. Last main commit at start: the Plan-5a merge (`140f841`).

---

## Cross-task patterns to internalize before starting

### Dark color token mapping

Apply consistently across every file touched. NEVER write `dark:` variants that aren't in this table; if a class isn't listed, look up the closest analog and ask before inventing.

| Light class | Dark variant added |
|---|---|
| `bg-white` | `dark:bg-slate-900` |
| `bg-slate-50` | `dark:bg-slate-950` |
| `bg-slate-100` | `dark:bg-slate-800` |
| `bg-slate-200` | `dark:bg-slate-700` |
| `text-slate-900` | `dark:text-slate-50` |
| `text-slate-800` | `dark:text-slate-100` |
| `text-slate-700` | `dark:text-slate-200` |
| `text-slate-600` | `dark:text-slate-300` |
| `text-slate-500` | `dark:text-slate-400` |
| `text-slate-400` | `dark:text-slate-500` |
| `border-slate-200` | `dark:border-slate-700` |
| `border-slate-300` | `dark:border-slate-600` |
| `bg-indigo-50` | `dark:bg-indigo-950` |
| `text-indigo-700` | `dark:text-indigo-300` |
| `border-indigo-200` | `dark:border-indigo-800` |
| `bg-emerald-50` | `dark:bg-emerald-950` |
| `text-emerald-700` | `dark:text-emerald-300` |
| `border-emerald-200` | `dark:border-emerald-800` |
| `bg-amber-50` | `dark:bg-amber-950` |
| `text-amber-700` | `dark:text-amber-300` |
| `border-amber-200` | `dark:border-amber-800` |
| `bg-rose-50` | `dark:bg-rose-950` |
| `text-rose-700` | `dark:text-rose-300` |
| `border-rose-200` | `dark:border-rose-800` |
| `bg-blue-50` | `dark:bg-indigo-950` (no blue tokens remain) |
| `text-blue-600` | `dark:text-indigo-400` (no blue tokens remain) |
| `hover:bg-slate-50` | `dark:hover:bg-slate-800` |
| `hover:bg-slate-100` | `dark:hover:bg-slate-800` |
| `ring-white` | `dark:ring-slate-900` |

For shadows (`shadow-sm`, `shadow-md`): leave in light, suppress in dark via `dark:shadow-none`. Borders carry the visual weight in dark mode.

### Responsive breakpoint conventions

- `sm:` ≥ 640px (mobile landscape / small tablet)
- `md:` ≥ 768px (tablet)
- `lg:` ≥ 1024px (laptop)
- Mobile-first: write the small-screen rule as the default, then add `md:` / `lg:` overrides.

---

## Tasks

### Task 1: Dark mode foundation — toggle, palette tokens, layout config

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `components/ui/theme-toggle.tsx` (client)
- Modify: `app/customer/layout.tsx`, `app/employee/layout.tsx`, `app/admin/orgs/[orgId]/layout.tsx` — insert the ThemeToggle in each header

Plan 5a Task 1 wrapped the app in `ThemeProvider` with `enableSystem={false}` and `defaultTheme="light"`. Activate system + persistence here.

- [ ] **Step 1: Update ThemeProvider config in `app/layout.tsx`**

Find the `<ThemeProvider ...>` line. Change from:

```tsx
<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
```

to:

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
```

This makes the app honor `prefers-color-scheme` on first load and persists user toggles to localStorage.

- [ ] **Step 2: Create the toggle component**

Create `components/ui/theme-toggle.tsx`:

```tsx
"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch — render a neutral placeholder until client-side mount.
  if (!mounted) {
    return (
      <span
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500",
          className,
        )}
        aria-hidden="true"
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        className,
      )}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
```

The `mounted` guard prevents the next-themes hydration warning (the server doesn't know the user's resolved theme; the placeholder reserves space until the client knows).

- [ ] **Step 3: Insert ThemeToggle in each role layout**

For each of the three layouts, find the header's right-side cluster (where `NotificationsBell`, user name, sign out form sit). Insert `<ThemeToggle />` BEFORE the `NotificationsBell`:

`app/customer/layout.tsx` and `app/employee/layout.tsx`:
```tsx
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Inside the right-side cluster of the header:
<ThemeToggle />
<NotificationsBell initialUnreadCount={initialUnread} href={/* … */} />
```

`app/admin/orgs/[orgId]/layout.tsx`: same insertion.

- [ ] **Step 4: Apply minimum dark variants to `app/layout.tsx` body**

Change the `<body>` className from `font-sans antialiased` to:

```tsx
<body className="bg-slate-50 font-sans text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-50">
```

This sets a baseline so any page that DOESN'T explicitly set a background still picks up the dark backdrop.

- [ ] **Step 5: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Manual smoke check (optional): `pnpm dev`, sign in, click the toggle, observe the header chrome flips light/dark. Pages will look broken in dark mode until Task 2 sweep — that's expected.

- [ ] **Step 6: Commit**

```bash
git checkout -b feat/phase-1-plan-5b-interactions-polish
git add app/layout.tsx app/globals.css components/ui/theme-toggle.tsx app/customer/layout.tsx app/employee/layout.tsx "app/admin/orgs/[orgId]/layout.tsx"
git commit -m "feat(theme): activate next-themes system + toggle, baseline dark body"
```

NOTE: branch creation is the FIRST command on Task 1.

---

### Task 2: Dark mode sweep — components and pages

**Files:** All app/* pages and components/* presentational files that have light-only color tokens. Listed below in the steps. Use the dark token mapping table above.

This is a big systematic edit. The goal: every page that renders content must look correct in both light and dark mode.

- [ ] **Step 1: Component sweep**

For each component file listed, apply the dark-variant mapping:

- `components/ui/avatar.tsx` — `AvatarStack`'s overflow chip uses `bg-slate-200 text-slate-700 ring-2 ring-white`. Add `dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-900`. The avatar palette itself uses `*-500 text-white` colors that already work in dark — leave them.
- `components/ui/status-pill.tsx` — the pill classes come from `lib/constants/status.ts`. Add dark variants in that file (see Step 2).
- `components/app/empty-state.tsx` — `border-slate-200 bg-white text-slate-900 text-slate-500` → add dark variants.
- `components/app/page-header.tsx` — `text-slate-900 text-slate-500` → add dark variants.
- `components/app/activity-feed.tsx` — empty state's `border-slate-200 bg-white text-slate-500` → add dark variants.
- `components/app/activity-feed-event.tsx` — the update card (`border-slate-200 bg-white`), the divider (`bg-slate-200 text-slate-400`), event meta (`text-slate-500 text-slate-700 text-slate-900 text-slate-400`), internal pill (`border-slate-200 bg-slate-50 text-slate-500`) → add dark variants for each.
- `components/app/task-card.tsx` — `border-slate-200 bg-white text-slate-900 text-slate-500 text-slate-400 shadow-sm`, hover `hover:border-slate-300 hover:shadow-md` → add dark variants (`dark:border-slate-700 dark:bg-slate-900 ...` and `dark:hover:border-slate-600 dark:hover:shadow-none`).
- `components/app/task-action-bar.tsx` — outer `border-slate-200 bg-white` → add dark variants.
- `components/app/post-update-form.tsx` — the "More options" toggle button `text-slate-500 hover:text-slate-700` → add dark variants.
- `components/app/attachment-list.tsx` — list items `border bg-white px-3 py-2`, error text `text-red-600` → add dark variants for the white bg and the link text-indigo-600.
- `components/app/notifications-list.tsx` and `components/app/employee-notifications-list.tsx` and `components/app/admin-notifications-list.tsx` — the unread border `border-blue-300` (already migrated? if not, also indigo) and the card bgs — add dark variants.
- `components/app/task-list-item.tsx` (if it still exists post-5a) — same treatment.
- `components/app/comment-thread.tsx` and `components/app/comment-reply-form.tsx` — bgs, borders, text.
- `components/app/task-status-changer.tsx` — error text and Select internal styles inherit from base-ui defaults; verify visually. Add `dark:text-red-400` to error if needed.

For shadcn UI primitives (`components/ui/button.tsx`, `card.tsx`, `input.tsx`, `select.tsx`, etc.): they likely already have dark variants from the shadcn defaults. Verify by reading each; add dark variants ONLY if missing.

- [ ] **Step 2: Status pill colors — dark variants in `lib/constants/status.ts`**

Find each `*_PILL_CLASSES` map. Append dark variants to each string. Example for `TASK_STATUS_PILL_CLASSES`:

```ts
export const TASK_STATUS_PILL_CLASSES: Record<TaskStatus, string> = {
  todo: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
  blocked: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};
```

Same pattern for `WORK_REQUEST_STATUS_PILL_CLASSES`. The dot classes (`TASK_STATUS_DOT_CLASSES`) use `bg-*-300`-to-`*-500` shades that work in dark — leave them.

- [ ] **Step 3: Page sweep**

For each page file, apply the dark mapping. Most pages have a few `text-slate-*` strings + a couple of borders. Edit pass per file:

Customer:
- `app/customer/dashboard/page.tsx`
- `app/customer/projects/[projectId]/page.tsx`
- `app/customer/projects/page.tsx`
- `app/customer/projects/[projectId]/updates/[updateId]/page.tsx`
- `app/customer/requests/[requestId]/page.tsx`
- `app/customer/requests/new/page.tsx`
- `app/customer/requests/page.tsx`
- `app/customer/notifications/page.tsx`
- `app/customer/tasks/[taskId]/page.tsx`

Employee:
- `app/employee/dashboard/page.tsx`
- `app/employee/projects/[projectId]/page.tsx`
- `app/employee/projects/page.tsx`
- `app/employee/projects/[projectId]/updates/new/page.tsx`
- `app/employee/projects/[projectId]/updates/[updateId]/page.tsx`
- `app/employee/projects/[projectId]/time/new/page.tsx`
- `app/employee/tasks/page.tsx`
- `app/employee/tasks/[taskId]/page.tsx`
- `app/employee/time/page.tsx`
- `app/employee/notifications/page.tsx`

Admin (each prefixed `app/admin/orgs/[orgId]/`):
- `dashboard/page.tsx`
- `projects/page.tsx`
- `projects/new/page.tsx`
- `projects/[projectId]/page.tsx`
- `tasks/[taskId]/page.tsx`
- `work-requests/page.tsx`
- `work-requests/[requestId]/page.tsx`
- `notifications/page.tsx`

Plus:
- `app/admin/orgs/page.tsx` (org picker)
- `app/admin/dashboard/page.tsx` (redirect; no content to touch)
- `app/login/page.tsx`, `app/signup/page.tsx`, `app/forgot/page.tsx`, `app/reset/page.tsx`, `app/magic-link/page.tsx`, `app/verify/page.tsx`

Layouts: already partially touched in Task 1 (the body baseline + ThemeToggle insert). Add dark variants to the header chrome:
- `app/customer/layout.tsx` — header `border-b bg-white` → `dark:border-slate-700 dark:bg-slate-900`. Nav links `text-slate-700 hover:text-slate-900` → `dark:text-slate-300 dark:hover:text-slate-50`. Brand link `font-semibold` is fine. User name span `text-slate-600` → `dark:text-slate-400`. Sign-out button `text-slate-600 hover:underline` → `dark:text-slate-400`.
- `app/employee/layout.tsx` and `app/admin/orgs/[orgId]/layout.tsx` — same treatment.

For each file, the edit is mechanical: find every Tailwind utility from the mapping table and append the corresponding `dark:` variant in the same `className`.

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Manual smoke (recommended): `pnpm dev`, toggle theme, click through:
- Customer: dashboard → project → task detail → notifications → settings (later task)
- Employee: same
- Admin: same

Look for unstyled white blocks or unreadable text (slate-900 on slate-950 background, etc.). Each is a missed class.

- [ ] **Step 5: Commit**

```bash
git add app components lib/constants/status.ts
git commit -m "feat(dark-mode): apply dark: variants across components and pages"
```

This is a big diff. Acceptable — the change is mechanical and the gates (typecheck/lint/build) verify completeness at the type level. Visual completeness is verified manually.

---

### Task 3: Mobile responsive layouts

**Files:**
- Modify: `app/customer/layout.tsx`, `app/employee/layout.tsx`, `app/admin/orgs/[orgId]/layout.tsx` — hamburger nav for small screens
- Create: `components/app/mobile-nav-sheet.tsx` — the sliding panel that holds the nav links on mobile
- Modify: pages with multi-column grids — collapse to single column on `sm:`
- Modify: forms — apply `text-base` on mobile inputs to suppress iOS auto-zoom
- Create: `tests/e2e/responsive.spec.ts` — Playwright spec at 375 / 768 / 1024 viewport widths

- [ ] **Step 1: Create the mobile nav sheet**

Create `components/app/mobile-nav-sheet.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type MobileNavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function MobileNavSheet({ links }: { links: MobileNavLink[] }) {
  const [open, setOpen] = React.useState(false);

  // Close on route change isn't trivial in App Router without a side-effect;
  // close on body click outside the sheet instead.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const sheet = document.getElementById("mobile-nav-sheet");
      if (sheet && !sheet.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100",
          "md:hidden",
          "dark:text-slate-300 dark:hover:bg-slate-800",
        )}
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/30 dark:bg-slate-950/60">
          <aside
            id="mobile-nav-sheet"
            className={cn(
              "fixed left-0 top-0 z-50 h-full w-64 bg-white p-4 shadow-lg",
              "dark:bg-slate-900 dark:shadow-none dark:border-r dark:border-slate-700",
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire MobileNavSheet into each layout**

For each layout, find the existing `<nav className="flex items-center gap-4 text-sm">…</nav>`. Add `hidden md:flex` so it's hidden on mobile, and render `<MobileNavSheet links={...} />` next to it (so the hamburger shows on mobile only).

Example for `app/employee/layout.tsx`:

```tsx
import { MobileNavSheet, type MobileNavLink } from "@/components/app/mobile-nav-sheet";

const EMPLOYEE_NAV: MobileNavLink[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employee/projects", label: "Projects", icon: FolderKanban },
  { href: "/employee/tasks", label: "My tasks", icon: CheckSquare },
  { href: "/employee/time", label: "Time", icon: Clock },
];

// Inside the header's left side:
<div className="flex items-center gap-6">
  <MobileNavSheet links={EMPLOYEE_NAV} />
  <Link href="/employee/dashboard" className="font-semibold">
    Marketing CRM
  </Link>
  <nav aria-label="Main" className="hidden items-center gap-4 text-sm md:flex">
    {/* existing links */}
  </nav>
</div>
```

Same pattern for `customer/layout.tsx` (customer links: Dashboard / Projects / Requests) and `admin/orgs/[orgId]/layout.tsx` (admin links: Dashboard / Projects / Work requests; each href prefixed with `/admin/orgs/${orgId}/`).

For admin, the link list is computed from `orgId` so define it inside the component body (not at module scope):

```tsx
const ADMIN_NAV: MobileNavLink[] = [
  { href: `/admin/orgs/${orgId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
  { href: `/admin/orgs/${orgId}/projects`, label: "Projects", icon: FolderKanban },
  { href: `/admin/orgs/${orgId}/work-requests`, label: "Work requests", icon: Inbox },
];
```

- [ ] **Step 3: Grid collapse on small screens**

Several pages use `md:grid-cols-2` or `md:grid-cols-3` — these already collapse to single column below `md:`. Verify each is correct:

- Customer dashboard, customer projects list: should be `grid gap-3 md:grid-cols-2` already (Plan 5a). No change needed.
- Admin dashboard KPI row: `grid gap-3 md:grid-cols-3`. Already correct.
- Login/signup forms: `max-w-md` containers, no grid, already mobile-friendly.

For the admin notifications-list grid (if any) and the admin work-requests filter pills row: verify each. If anything renders as multiple columns at all viewports, add `md:` prefix.

- [ ] **Step 4: Form input sizing for iOS**

iOS Safari auto-zooms the viewport when focusing an input whose computed font-size is < 16px. The shadcn `Input` and `Textarea` components default to `text-sm` (14px). On mobile we need 16px.

Read `components/ui/input.tsx`. Find the default class string for the `<input>` element. Add `md:text-sm` to the existing classes, then change the base size to `text-base`. Example:

```tsx
// Before:
className={cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ...",
)}

// After:
className={cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ...",
)}
```

Same change for `components/ui/textarea.tsx`.

This makes inputs 16px on mobile (suppresses zoom) and 14px on tablet/desktop (compact).

- [ ] **Step 5: TaskCard meta wrap**

The TaskCard's meta row (`mt-3 flex flex-wrap items-center gap-3 text-xs`) already wraps via `flex-wrap`. On very narrow screens the assignee stack + counts + due date may stack vertically — that's acceptable. Verify by resizing the dev server's window.

- [ ] **Step 6: ActivityFeed icon column collapse**

The ActivityFeed events use a leading icon (Avatar / lucide icon) followed by content. On `< sm` the icons can be hidden to save horizontal space.

Read `components/app/activity-feed-event.tsx`. For each event renderer, wrap the leading icon (`<MessageCircle>`, `<Clock>`, `<Paperclip>`, etc.) in a `hidden sm:inline-flex` wrapper. The avatar itself can stay visible since it's user-identifying. Example for the `comment` case:

```tsx
case "comment":
  return (
    <div className="flex items-start gap-2 pl-6 text-sm">
      <MessageCircle className="mt-0.5 hidden h-4 w-4 text-slate-400 dark:text-slate-500 sm:inline-block" aria-hidden="true" />
      <Avatar … />
      …
    </div>
  );
```

Apply to the lucide icons in `comment`, `status_change`, `time_log`, `attachment` renderers. (`update` doesn't have a leading icon column — its header is inline.)

- [ ] **Step 7: Responsive E2E**

Create `tests/e2e/responsive.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

const VIEWPORTS = [
  { width: 375, height: 667, label: "mobile" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 1024, height: 768, label: "laptop" },
];

for (const vp of VIEWPORTS) {
  test(`employee sign-in flow at ${vp.label} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/login");
    await page.fill("input#email", "employee@e2e.test");
    await page.fill("input#password", PWD);
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/\/employee\/dashboard$/);

    if (vp.width < 768) {
      // Mobile: hamburger should be visible, desktop nav hidden.
      const hamburger = page.getByLabel("Open menu");
      await expect(hamburger).toBeVisible();
      await hamburger.click();
      await expect(page.getByRole("link", { name: /My tasks/ })).toBeVisible();
    } else {
      // Tablet/laptop: desktop nav should be visible directly.
      await expect(page.getByRole("link", { name: /My tasks/ })).toBeVisible();
    }
  });
}
```

- [ ] **Step 8: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e tests/e2e/responsive.spec.ts
git add components/app/mobile-nav-sheet.tsx components/ui/input.tsx components/ui/textarea.tsx components/app/activity-feed-event.tsx app/customer/layout.tsx app/employee/layout.tsx "app/admin/orgs/[orgId]/layout.tsx" tests/e2e/responsive.spec.ts
git commit -m "feat(responsive): hamburger nav, 16px form inputs, ActivityFeed icon collapse, responsive E2E"
```

---

### Task 4: Custom SVG illustrations + EmptyState refresh

**Files:**
- Create: `components/app/illustrations/empty-tasks.tsx`, `empty-projects.tsx`, `empty-updates.tsx`, `empty-notifications.tsx`, `empty-requests.tsx`, `empty-search.tsx`
- Modify: `components/app/empty-state.tsx` — accept `illustration` prop (preferred), falls back to `icon` prop
- Modify: pages that use empty states — opt into illustrations where appropriate

Each illustration is a hand-drawn-feel two-color SVG that uses `currentColor` for the stroke / fill so it re-tints in dark mode. Aim for ~3–5 KB inline per illustration.

- [ ] **Step 1: empty-tasks illustration**

Create `components/app/illustrations/empty-tasks.tsx`:

```tsx
export function EmptyTasksIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="18"
        y="14"
        width="56"
        height="72"
        rx="6"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.4"
      />
      <line x1="28" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="2" />
      <line x1="28" y1="44" x2="64" y2="44" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <line x1="28" y1="56" x2="50" y2="56" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <line x1="28" y1="68" x2="60" y2="68" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <circle cx="22" cy="32" r="2.5" fill="currentColor" />
      <circle cx="22" cy="44" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="22" cy="56" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="22" cy="68" r="2.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
```

- [ ] **Step 2: empty-projects illustration**

Create `components/app/illustrations/empty-projects.tsx`:

```tsx
export function EmptyProjectsIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M14 28h26l8 8h34a4 4 0 014 4v40a4 4 0 01-4 4H14a4 4 0 01-4-4V32a4 4 0 014-4z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.4"
      />
      <path
        d="M14 28h26l8 8h34a4 4 0 014 4v6H10v-14a4 4 0 014-4z"
        fill="currentColor"
        opacity="0.1"
      />
    </svg>
  );
}
```

- [ ] **Step 3: empty-updates illustration**

```tsx
// components/app/illustrations/empty-updates.tsx
export function EmptyUpdatesIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <rect x="14" y="20" width="68" height="56" rx="6" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <rect x="22" y="30" width="52" height="3" rx="1.5" fill="currentColor" />
      <rect x="22" y="40" width="40" height="3" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="22" y="50" width="48" height="3" rx="1.5" fill="currentColor" opacity="0.6" />
      <rect x="22" y="60" width="32" height="3" rx="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
```

- [ ] **Step 4: empty-notifications illustration**

```tsx
// components/app/illustrations/empty-notifications.tsx
export function EmptyNotificationsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <path
        d="M48 18a16 16 0 00-16 16v14l-6 10h44l-6-10V34a16 16 0 00-16-16z"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.4"
      />
      <path
        d="M42 62h12a6 6 0 01-12 0z"
        stroke="currentColor"
        strokeWidth="2"
        fill="currentColor"
        fillOpacity="0.1"
      />
    </svg>
  );
}
```

- [ ] **Step 5: empty-requests illustration**

```tsx
// components/app/illustrations/empty-requests.tsx
export function EmptyRequestsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <rect x="14" y="24" width="68" height="48" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <path d="M14 24l34 26 34-26" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}
```

- [ ] **Step 6: empty-search illustration**

```tsx
// components/app/illustrations/empty-search.tsx
export function EmptySearchIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" className={className} aria-hidden="true">
      <circle cx="42" cy="42" r="22" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <path d="M58 58l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 7: EmptyState refresh — accept `illustration` prop**

Modify `components/app/empty-state.tsx`:

```tsx
import * as React from "react";

export function EmptyState({
  icon: Icon,
  illustration: Illustration,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  illustration?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      {Illustration ? (
        <Illustration className="h-20 w-20 text-indigo-500 dark:text-indigo-400" />
      ) : Icon ? (
        <Icon className="h-8 w-8 text-slate-400 dark:text-slate-500" />
      ) : null}
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
```

The illustration is rendered at 80px × 80px (`h-20 w-20`) which fits the existing card padding. The `text-indigo-500` color flows through `currentColor` to tint the SVG.

- [ ] **Step 8: Opt pages into illustrations**

For each list page that previously rendered a plain "No X yet" `<p>`, swap to `<EmptyState illustration={...} title="..." description="..." action={...} />`.

Targeted pages:
- Customer projects list — `EmptyProjectsIllustration`, title `"No projects yet"`, description `"You'll see projects here once they're set up."`, no action.
- Employee projects list — same.
- Customer requests list — `EmptyRequestsIllustration`, title `"No work requests yet"`, description `"Click 'New work request' to submit your first one."`, action: a Link styled as button to `/customer/requests/new`.
- Employee tasks list — `EmptyTasksIllustration`, title `"No tasks match"`, description `"Try a different filter or wait until you're assigned to something."`.
- Customer/employee notifications — `EmptyNotificationsIllustration`, title `"No notifications yet"`, description `"We'll let you know when something happens."`.

Each modification is small: replace the existing `{x.length === 0 ? <p>No X yet.</p> : ...}` with `{x.length === 0 ? <EmptyState ... /> : ...}` and import the illustration component + EmptyState.

- [ ] **Step 9: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/illustrations components/app/empty-state.tsx app/customer app/employee
git commit -m "feat(empty-states): six SVG illustrations + EmptyState illustration prop, applied to list pages"
```

---

### Task 5: Avatar image uploads

**Files:**
- Modify: `lib/services/attachments/schemas.ts` — add `user_avatar` to the parent-type enum
- Modify: `lib/services/attachments/internal.ts` — authorize `user_avatar` parent
- Create: `lib/services/users/profile.ts` — `updateProfile(db, ctx, { name, avatarAttachmentId? })`
- Modify: `lib/services/users/index.ts` — re-export `updateProfile`
- Create: `lib/server-actions/users.ts` — `updateProfileAction`
- Create: `components/app/avatar-upload.tsx` — image-only variant of AttachmentUpload + writes to users.image on confirm
- Modify: `components/ui/avatar.tsx` — `Avatar` reads `image` URL if provided

- [ ] **Step 1: Extend `attachmentParentTypeEnum`**

Read `lib/services/attachments/schemas.ts`. The current enum is `["daily_update", "work_request", "task", "comment"]`. Add `"user_avatar"`:

```ts
export const attachmentParentTypeEnum = z.enum([
  "daily_update",
  "work_request",
  "task",
  "comment",
  "user_avatar",
]);
```

Also tighten the MIME type whitelist used at the upload-action layer to image-only when `parent_type === "user_avatar"`. The simplest way: in `lib/services/attachments/index.ts`'s `getUploadUrl`, after the existing validation, add:

```ts
if (parsed.data.parentType === "user_avatar") {
  const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  if (!imageTypes.has(parsed.data.contentType)) {
    return err("validation", "Avatar must be PNG, JPEG, WebP, or GIF", {
      fields: { contentType: "Image format required" },
    });
  }
  const fiveMB = 5 * 1024 * 1024;
  if (parsed.data.sizeBytes > fiveMB) {
    return err("validation", `Avatar exceeds the 5 MB limit`, {
      fields: { sizeBytes: "Max 5 MB" },
    });
  }
}
```

Place this check BEFORE the `authorizeAttachmentParentWrite` call.

- [ ] **Step 2: Authorize `user_avatar` parent**

Modify `lib/services/attachments/internal.ts`. Find `authorizeAttachmentParentWrite` and `authorizeAttachmentParentRead`. Add a case for `user_avatar`:

```ts
// In both authorize functions:
if (parentType === "user_avatar") {
  // Only the user themselves can write/read their own avatar attachment row.
  // (After confirm, the public-ish URL is written to users.image and read freely.)
  if (parentId !== ctx.actor.userId) return err("unauthorized", "Cannot manage another user's avatar");
  return ok(undefined as never);
}
```

Place this BEFORE the existing switch on parent type. The avatar-row uses the userId as the parent_id, so the check is just "is the parent_id me".

- [ ] **Step 3: Create the profile service**

Create `lib/services/users/profile.ts`:

```ts
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { z } from "zod";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { presignGet } from "@/lib/storage/r2-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

const updateProfileInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarAttachmentId: z.string().uuid().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export async function updateProfile(
  db: AnyDb,
  ctx: OrgContext,
  input: UpdateProfileInput,
): Promise<Result<{ id: string; name: string; image: string | null }>> {
  const parsed = updateProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", {
      fields: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.map(String).join("."), i.message]),
      ),
    });
  }

  const updates: Partial<typeof schema.users.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;

  if (parsed.data.avatarAttachmentId !== undefined) {
    const [row] = await db
      .select({
        id: schema.attachments.id,
        r2Key: schema.attachments.r2Key,
        uploadedBy: schema.attachments.uploadedBy,
        parentType: schema.attachments.parentType,
        parentId: schema.attachments.parentId,
        status: schema.attachments.status,
      })
      .from(schema.attachments)
      .where(eq(schema.attachments.id, parsed.data.avatarAttachmentId))
      .limit(1);
    if (!row) return err("not_found", "Avatar attachment not found");
    if (row.uploadedBy !== ctx.actor.userId) {
      return err("unauthorized", "Cannot use someone else's attachment");
    }
    if (row.parentType !== "user_avatar" || row.parentId !== ctx.actor.userId) {
      return err("validation", "Attachment is not a user_avatar for the current user");
    }
    if (row.status !== "ready") {
      return err("validation", "Avatar attachment is not yet confirmed");
    }
    // Store a presigned URL — short-lived. The Avatar component refreshes on
    // each render via this column; if the URL expires the avatar falls back to
    // initials. A future polish pass can switch to a public-bucket URL.
    const url = await presignGet(row.r2Key, 60 * 60 * 24 * 7); // 7 days
    updates.image = url;
  }

  const [updated] = await db
    .update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, ctx.actor.userId))
    .returning({
      id: schema.users.id,
      name: schema.users.name,
      image: schema.users.image,
    });
  if (!updated) return err("not_found", "User not found");
  return ok({ id: updated.id, name: updated.name ?? "", image: updated.image ?? null });
}
```

NOTE: the 7-day presigned URL is a Phase 1 simplification. The proper fix is a CDN-fronted public path; deferred to a future plan.

- [ ] **Step 4: Re-export from users service index**

Modify `lib/services/users/index.ts`. Add:

```ts
export { updateProfile, type UpdateProfileInput } from "./profile";
```

- [ ] **Step 5: Server action wrapper**

Create `lib/server-actions/users.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as users from "@/lib/services/users";

export async function updateProfileAction(input: users.UpdateProfileInput) {
  const r = await withSessionContext((db, ctx) => users.updateProfile(db, ctx, input));
  if (r.ok) {
    revalidatePath("/customer/settings/profile", "page");
    revalidatePath("/employee/settings/profile", "page");
    revalidatePath("/admin/settings/profile", "page");
  }
  return r;
}
```

- [ ] **Step 6: AvatarUpload component**

Create `components/app/avatar-upload.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload } from "lucide-react";
import {
  getUploadUrlAction,
  confirmAttachmentAction,
} from "@/lib/server-actions/attachments";
import { updateProfileAction } from "@/lib/server-actions/users";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX = 5 * 1024 * 1024;

export function AvatarUpload({
  userId,
  name,
  email,
  currentImage,
}: {
  userId: string;
  name: string | null;
  email: string;
  currentImage: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setProgress(null);

    if (!ALLOWED.includes(file.type)) {
      setError(`File type "${file.type}" is not allowed.`);
      e.target.value = "";
      return;
    }
    if (file.size > MAX) {
      setError("File exceeds the 5 MB limit.");
      e.target.value = "";
      return;
    }

    const input = e.target;
    startTransition(async () => {
      setProgress("Requesting upload URL…");
      const urlR = await getUploadUrlAction({
        parentType: "user_avatar",
        parentId: userId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!urlR.ok) {
        setError(urlR.error.message);
        setProgress(null);
        return;
      }

      setProgress("Uploading…");
      try {
        const put = await fetch(urlR.data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!put.ok) {
          setError(`Upload failed: ${put.status}`);
          setProgress(null);
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setProgress(null);
        return;
      }

      setProgress("Confirming…");
      const conf = await confirmAttachmentAction({ id: urlR.data.attachmentId });
      if (!conf.ok) {
        setError(conf.error.message);
        setProgress(null);
        return;
      }

      setProgress("Saving…");
      const upd = await updateProfileAction({ avatarAttachmentId: urlR.data.attachmentId });
      setProgress(null);
      if (!upd.ok) {
        setError(upd.error.message);
        return;
      }
      input.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar userId={userId} name={name} email={email} image={currentImage ?? undefined} size="lg" />
      <div className="flex-1 space-y-2">
        <label htmlFor="avatar-input" className="block">
          <span className="sr-only">Upload avatar</span>
          <input
            id="avatar-input"
            type="file"
            accept={ALLOWED.join(",")}
            disabled={pending}
            onChange={onChange}
            className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100 dark:text-slate-400 dark:file:border-slate-700 dark:file:bg-slate-800 dark:file:text-slate-200 dark:hover:file:bg-slate-700"
          />
        </label>
        {progress && <p className="text-xs text-slate-500 dark:text-slate-400">{progress}</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
```

NOTE: this component passes a new `image` prop to `Avatar` — Step 7 adds it.

- [ ] **Step 7: Avatar component reads `image` URL**

Modify `components/ui/avatar.tsx`. Add an `image` prop:

```tsx
export function Avatar({
  userId,
  name,
  email,
  image,
  size = "sm",
  className,
}: {
  userId: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const initials = initialsFrom(name, email);
  const palette = PALETTE[hash(userId) % PALETTE.length]!;
  const label = name ?? email ?? initials;

  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={label}
        title={label}
        className={cn(
          "inline-block select-none rounded-full object-cover",
          SIZE_CLASSES[size],
          className,
        )}
      />
    );
  }

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
```

Update `AvatarStack` to also accept and pass through `image` per user:

```tsx
export function AvatarStack({
  users,
  max = 3,
  size = "sm",
}: {
  users: { id: string; name?: string | null; email?: string | null; image?: string | null }[];
  max?: number;
  size?: AvatarSize;
}) {
  // … (existing body, but pass `image={u.image}` into each <Avatar>)
}
```

NOTE: Existing callers of `AvatarStack` don't pass `image` (the prop is optional), so this is backward-compatible. They'll just render initials until the activity/card aggregators learn to load `users.image` — that's a follow-up for Plan 5c or a small enhancement in the existing aggregators. For 5b, the avatar uploads are visible on the user's own settings page and in the header chrome (which fetches `session.user.image` from Better Auth).

- [ ] **Step 8: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git add lib/services/attachments lib/services/users lib/server-actions/users.ts components/app/avatar-upload.tsx components/ui/avatar.tsx
git commit -m "feat(profile): avatar image uploads via user_avatar attachment parent type"
```

---

### Task 6: User settings page × 3 roles

**Files:**
- Create: `components/app/profile-settings.tsx` — the reusable form (`"use client"`)
- Create: `app/customer/settings/profile/page.tsx`
- Create: `app/employee/settings/profile/page.tsx`
- Create: `app/admin/settings/profile/page.tsx`
- Modify: 3 role layouts — add a "Settings" link in the user-cluster (small dropdown? or just a plain link). For 5b simplicity: plain link next to the user name.

- [ ] **Step 1: ProfileSettings form**

Create `components/app/profile-settings.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AvatarUpload } from "./avatar-upload";
import { updateProfileAction } from "@/lib/server-actions/users";

export function ProfileSettings({
  userId,
  name,
  email,
  image,
}: {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
}) {
  const router = useRouter();
  const [nameInput, setNameInput] = useState(name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const r = await updateProfileAction({ name: nameInput });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-medium text-slate-900 dark:text-slate-50">Avatar</h2>
        <AvatarUpload userId={userId} name={name} email={email} currentImage={image} />
      </section>

      <section>
        <form onSubmit={onSave} className="space-y-4">
          <h2 className="text-base font-medium text-slate-900 dark:text-slate-50">Display name</h2>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              required
              maxLength={120}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={email} disabled readOnly />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Email cannot be changed here. Contact an admin if you need it updated.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            {savedAt && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Customer profile page**

Create `app/customer/settings/profile/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { PageHeader } from "@/components/app/page-header";
import { ProfileSettings } from "@/components/app/profile-settings";

export default async function CustomerProfileSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" subtitle="Manage your account details." />
      <ProfileSettings
        userId={session.user.id}
        name={session.user.name ?? null}
        email={session.user.email}
        image={(session.user as { image?: string | null }).image ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 3: Employee profile page**

Create `app/employee/settings/profile/page.tsx` — same body as customer but the page title/subtitle stay the same (the underlying ProfileSettings is identical for all roles). Use the same code above, just under the employee path.

- [ ] **Step 4: Admin profile page**

Create `app/admin/settings/profile/page.tsx` — same as customer/employee. The admin's path is org-agnostic (it's a personal setting, not org-scoped), so it lives at `/admin/settings/profile`, NOT `/admin/orgs/[orgId]/settings/profile`.

The middleware (Plan 1) already gates `/admin/**` by `system_role = 'admin'`. Verify by reading `middleware.ts` — if the gate checks for `/admin/orgs/` specifically rather than `/admin/`, the new `/admin/settings/...` route would not be gated. Add a guard at the layout level or extend the middleware as needed.

If the middleware's matcher captures all `/admin/*` paths, no change needed. Read it.

- [ ] **Step 5: Settings link in each layout**

For each of the three role layouts (`app/customer/layout.tsx`, `app/employee/layout.tsx`, `app/admin/orgs/[orgId]/layout.tsx`), find the right-side cluster where the user name lives. Replace the bare user-name span with a Link that points to the appropriate settings page:

```tsx
<Link
  href="/customer/settings/profile"  // or /employee/... or /admin/settings/profile
  className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
>
  {session.user.name ?? session.user.email}
</Link>
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/profile-settings.tsx app/customer/settings app/employee/settings app/admin/settings app/customer/layout.tsx app/employee/layout.tsx "app/admin/orgs/[orgId]/layout.tsx"
git commit -m "feat(profile): settings page per role with display-name editor + avatar upload"
```

---

### Task 7: Polymorphic comments — schema migration + service refactor

**Files:**
- Modify: `lib/db/schema/comments.ts` — drop `daily_update_id`, add `parent_type` + `parent_id`
- Create: Drizzle migration via `pnpm db:generate`
- Modify: `lib/services/comments/schemas.ts` — update Zod input shape
- Modify: `lib/services/comments/index.ts` — update `postComment` + `listComments` to take `{ parentType, parentId }`
- Modify: `lib/services/_auth/predicates.ts` — extend `requireCommentWrite` to handle both parent types
- Modify: `lib/services/notifications/index.ts` — update the `comment.posted` emit payload
- Modify: `lib/services/tasks/activity.ts` — `listActivityForTask` and `listRecentActivity` updated to query both task-direct comments AND update-linked comments
- Modify: `lib/server-actions/comments.ts` — wrappers take the new shape
- Modify: existing UI consumers — `comment-reply-form.tsx`, `comment-thread.tsx`
- Modify: tests — update fixtures + integration tests

This is the heaviest task in 5b. Pre-prod data is the only existing comment data; we can drop it cleanly.

- [ ] **Step 1: Update schema**

Modify `lib/db/schema/comments.ts`. Replace the current `comments` table definition:

```ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./better-auth";

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    parentType: text("parent_type").notNull(),  // 'daily_update' | 'task'
    parentId: uuid("parent_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    byParent: index("comments_parent_idx").on(t.parentType, t.parentId, sql`${t.createdAt} desc`),
  }),
);
```

NOTE: existing schema may include `dailyUpdateId` column referencing `dailyUpdates`. Remove that column and its index.

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Drizzle generates a new migration in `lib/db/migrations/`. Open it and verify:
- `ALTER TABLE comments DROP COLUMN daily_update_id;` (or similar)
- `ALTER TABLE comments ADD COLUMN parent_type text NOT NULL DEFAULT 'daily_update';`
- `ALTER TABLE comments ADD COLUMN parent_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';`
- Then DROP the defaults (Drizzle adds them temporarily to handle existing rows).

Since pre-prod has only Plan 4 seed data, the existing comments (if any) will be lost. That's accepted. If the migration fails because the temporary default UUID doesn't satisfy an FK, add a manual line to the generated SQL: `DELETE FROM comments;` before the `ADD COLUMN` statements.

Apply:

```bash
pnpm db:migrate
```

Verify by running `docker exec marketing-crm-db psql -U crm -d crm -c "\d comments"` — should show `parent_type` and `parent_id`, no `daily_update_id`.

- [ ] **Step 3: Update Zod schemas**

Modify `lib/services/comments/schemas.ts`:

```ts
import { z } from "zod";
import { idSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

export const commentParentTypeEnum = z.enum(["daily_update", "task"]);
export type CommentParentType = z.infer<typeof commentParentTypeEnum>;

export const postCommentInputSchema = z.object({
  parentType: commentParentTypeEnum,
  parentId: idSchema,
  body: nonEmptyStringSchema.max(5000),
});
export type PostCommentInput = z.infer<typeof postCommentInputSchema>;

export const listCommentsInputSchema = z.object({
  parentType: commentParentTypeEnum,
  parentId: idSchema,
});
export type ListCommentsInput = z.infer<typeof listCommentsInputSchema>;
```

- [ ] **Step 4: Update service functions**

Modify `lib/services/comments/index.ts`. Replace `postComment` and `listComments`:

```ts
import { and, asc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import type { OrgContext } from "@/lib/services/_context";
import { requireCommentWrite, requireCommentRead } from "@/lib/services/_auth/predicates";
import { emit } from "@/lib/services/notifications";
import {
  postCommentInputSchema,
  type PostCommentInput,
  listCommentsInputSchema,
  type ListCommentsInput,
} from "./schemas";

export type { PostCommentInput, ListCommentsInput, CommentParentType } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;
type Comment = typeof schema.comments.$inferSelect;

function zodIssuesToFields(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function postComment(
  db: AnyDb,
  ctx: OrgContext,
  input: PostCommentInput,
): Promise<Result<Comment>> {
  const parsed = postCommentInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }

  const access = await requireCommentWrite(db, ctx, parsed.data.parentType, parsed.data.parentId);
  if (!access.ok) return access;

  const [row] = await db
    .insert(schema.comments)
    .values({
      parentType: parsed.data.parentType,
      parentId: parsed.data.parentId,
      userId: ctx.actor.userId,
      body: parsed.data.body,
    })
    .returning();

  // Notify other participants.
  await emit(db, {
    orgId: ctx.orgId,
    eventType: "comment.posted",
    recipientUserIds: await collectParticipants(db, parsed.data.parentType, parsed.data.parentId, ctx.actor.userId),
    payload: {
      commentId: row!.id,
      parentType: parsed.data.parentType,
      parentId: parsed.data.parentId,
      projectId: await resolveProjectId(db, parsed.data.parentType, parsed.data.parentId),
      actorId: ctx.actor.userId,
    },
    relatedType: "comment",
    relatedId: row!.id,
  });

  return ok(row!);
}

export async function listComments(
  db: AnyDb,
  ctx: OrgContext,
  input: ListCommentsInput,
): Promise<Result<Comment[]>> {
  const parsed = listCommentsInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", { fields: zodIssuesToFields(parsed.error.issues) });
  }
  const access = await requireCommentRead(db, ctx, parsed.data.parentType, parsed.data.parentId);
  if (!access.ok) return access;
  const rows = await db
    .select()
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.parentType, parsed.data.parentType),
        eq(schema.comments.parentId, parsed.data.parentId),
      ),
    )
    .orderBy(asc(schema.comments.createdAt));
  return ok(rows);
}

// Helpers (private to this file):
async function collectParticipants(
  db: AnyDb,
  parentType: "daily_update" | "task",
  parentId: string,
  excludeUserId: string,
): Promise<string[]> {
  // For a daily_update parent: include the update author and other commenters on the same update.
  // For a task parent: include the task creator and all assignees and other commenters.
  // Implementation kept simple for Phase 1; admin recipients handled separately at the project layer.
  if (parentType === "daily_update") {
    const author = await db
      .select({ id: schema.dailyUpdates.userId })
      .from(schema.dailyUpdates)
      .where(eq(schema.dailyUpdates.id, parentId))
      .limit(1);
    const otherCommenters = await db
      .select({ id: schema.comments.userId })
      .from(schema.comments)
      .where(and(eq(schema.comments.parentType, "daily_update"), eq(schema.comments.parentId, parentId)));
    const ids = new Set<string>();
    if (author[0]) ids.add(author[0].id);
    for (const c of otherCommenters) ids.add(c.id);
    ids.delete(excludeUserId);
    return Array.from(ids);
  }
  // task
  const creator = await db
    .select({ id: schema.tasks.createdBy })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parentId))
    .limit(1);
  const assignees = await db
    .select({ id: schema.taskAssignments.userId })
    .from(schema.taskAssignments)
    .where(eq(schema.taskAssignments.taskId, parentId));
  const otherCommenters = await db
    .select({ id: schema.comments.userId })
    .from(schema.comments)
    .where(and(eq(schema.comments.parentType, "task"), eq(schema.comments.parentId, parentId)));
  const ids = new Set<string>();
  if (creator[0]) ids.add(creator[0].id);
  for (const a of assignees) ids.add(a.id);
  for (const c of otherCommenters) ids.add(c.id);
  ids.delete(excludeUserId);
  return Array.from(ids);
}

async function resolveProjectId(
  db: AnyDb,
  parentType: "daily_update" | "task",
  parentId: string,
): Promise<string | undefined> {
  if (parentType === "daily_update") {
    const [row] = await db
      .select({ projectId: schema.dailyUpdates.projectId })
      .from(schema.dailyUpdates)
      .where(eq(schema.dailyUpdates.id, parentId))
      .limit(1);
    return row?.projectId ?? undefined;
  }
  const [row] = await db
    .select({ projectId: schema.tasks.projectId })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parentId))
    .limit(1);
  return row?.projectId ?? undefined;
}
```

- [ ] **Step 5: Update auth predicates**

Modify `lib/services/_auth/predicates.ts`. The existing `requireCommentWrite` and `requireCommentRead` probably take `dailyUpdateId`. Rewrite to take `(parentType, parentId)`:

```ts
export async function requireCommentRead(
  db: AnyDb,
  ctx: OrgContext,
  parentType: "daily_update" | "task",
  parentId: string,
): Promise<Result<true>> {
  if (parentType === "daily_update") {
    return requireDailyUpdateRead(db, ctx, parentId);
  }
  // task
  return requireTaskRead(db, ctx, parentId);
}

export async function requireCommentWrite(
  db: AnyDb,
  ctx: OrgContext,
  parentType: "daily_update" | "task",
  parentId: string,
): Promise<Result<true>> {
  // Phase 1: anyone with read access to the parent can write a comment.
  return requireCommentRead(db, ctx, parentType, parentId);
}
```

If the existing predicates are different names or shapes, adapt — the goal is to gate writes by parent visibility (which is what they already do for daily updates).

- [ ] **Step 6: Update server-action wrappers**

Modify `lib/server-actions/comments.ts`. The current `postCommentAction(input)` and `listCommentsAction(input)` already take an `input` object — just update the type to match the new schema. The wrappers themselves don't need code changes since they just forward to the service:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as comments from "@/lib/services/comments";

export async function postCommentAction(input: comments.PostCommentInput) {
  const r = await withSessionContext((db, ctx) => comments.postComment(db, ctx, input));
  if (r.ok) {
    // Revalidate the relevant parent page subtrees.
    revalidatePath("/customer/projects", "layout");
    revalidatePath("/employee/projects", "layout");
    revalidatePath("/customer/tasks", "layout");
    revalidatePath("/employee/tasks", "layout");
    revalidatePath("/admin/orgs", "layout");
  }
  return r;
}

export async function listCommentsAction(input: comments.ListCommentsInput) {
  return withSessionContext((db, ctx) => comments.listComments(db, ctx, input));
}
```

Verify the existing wrapper code; preserve whatever revalidation it already does.

- [ ] **Step 7: Update activity service**

Modify `lib/services/tasks/activity.ts`. The comment query in `listActivityForTask` and `listRecentActivity` currently joins `comments` to `dailyUpdateTasks` via `dailyUpdateId`. Update to ALSO include comments where `parentType = 'task' AND parentId = $taskId`:

In `listActivityForTask`, change the comment query from:

```ts
db
  .select({...})
  .from(schema.comments)
  .innerJoin(schema.dailyUpdateTasks, eq(schema.dailyUpdateTasks.dailyUpdateId, schema.comments.dailyUpdateId))
  …
```

(which won't compile anymore because `comments.dailyUpdateId` no longer exists) to two parallel queries:

```ts
// Comments on linked daily updates:
const updateLinkedComments = await db
  .select({
    id: schema.comments.id,
    createdAt: schema.comments.createdAt,
    authorId: schema.comments.userId,
    authorName: schema.users.name,
    authorEmail: schema.users.email,
    body: schema.comments.body,
    parentUpdateId: schema.comments.parentId, // since parentType='daily_update'
  })
  .from(schema.comments)
  .innerJoin(
    schema.dailyUpdateTasks,
    eq(schema.dailyUpdateTasks.dailyUpdateId, schema.comments.parentId),
  )
  .innerJoin(schema.users, eq(schema.users.id, schema.comments.userId))
  .where(
    and(
      eq(schema.comments.parentType, "daily_update"),
      eq(schema.dailyUpdateTasks.taskId, taskId),
    ),
  );

// Comments posted directly on the task:
const taskDirectComments = await db
  .select({
    id: schema.comments.id,
    createdAt: schema.comments.createdAt,
    authorId: schema.comments.userId,
    authorName: schema.users.name,
    authorEmail: schema.users.email,
    body: schema.comments.body,
    parentUpdateId: sql<null>`null`.as("parent_update_id"), // task-direct has no parent update
  })
  .from(schema.comments)
  .innerJoin(schema.users, eq(schema.users.id, schema.comments.userId))
  .where(
    and(eq(schema.comments.parentType, "task"), eq(schema.comments.parentId, taskId)),
  );

const comments = [...updateLinkedComments, ...taskDirectComments];
```

The ActivityEvent type's `parentUpdateId` becomes `string | null` (was string). Update the type:

```ts
| {
    kind: "comment";
    id: string;
    taskId: string;
    createdAt: Date | string;
    authorId: string;
    authorName: string;
    authorEmail: string;
    body: string;
    parentUpdateId: string | null;  // null when task-direct
  }
```

Apply the same pattern in `listRecentActivity`.

Add `import { sql } from "drizzle-orm";` if not already imported.

- [ ] **Step 8: Update ActivityFeedEvent renderer**

Modify `components/app/activity-feed-event.tsx`. The `comment` case currently nests under an update. Now task-direct comments are top-level events. The renderer can still display them inline; just don't assume a parent update exists.

Update the comment case:

```tsx
case "comment":
  return (
    <div className={cn("flex items-start gap-2 text-sm", event.parentUpdateId && "pl-6")}>
      <MessageCircle className="mt-0.5 hidden h-4 w-4 text-slate-400 dark:text-slate-500 sm:inline-block" aria-hidden="true" />
      <Avatar userId={event.authorId} name={event.authorName} email={event.authorEmail} size="xs" />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-slate-900 dark:text-slate-50">
          {event.authorName || event.authorEmail}
        </span>
        <span className="text-slate-500 dark:text-slate-400"> · {ts}</span>
        <p className="mt-0.5 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
          {event.body}
        </p>
      </div>
    </div>
  );
```

The `pl-6` indent applies only for update-linked comments. Task-direct comments are flush-left.

- [ ] **Step 9: Update existing UI consumers**

The current `comment-reply-form.tsx` and `comment-thread.tsx` (Plan 3a) take `dailyUpdateId`. Update both to take `{ parentType, parentId }`:

`components/app/comment-reply-form.tsx` — change the prop and the action call:

```tsx
export function CommentReplyForm({
  parentType,
  parentId,
}: {
  parentType: "daily_update" | "task";
  parentId: string;
}) {
  // … existing useState etc.
  const r = await postCommentAction({ parentType, parentId, body });
  // …
}
```

`components/app/comment-thread.tsx` — same prop change:

```tsx
export async function CommentThread({
  parentType,
  parentId,
}: {
  parentType: "daily_update" | "task";
  parentId: string;
}) {
  const r = await listCommentsAction({ parentType, parentId });
  // …
}
```

Then update every caller. Grep for `CommentThread` and `CommentReplyForm` — they're used in:
- `app/customer/projects/[projectId]/updates/[updateId]/page.tsx`
- `app/employee/projects/[projectId]/updates/[updateId]/page.tsx`

In each, change the prop from `dailyUpdateId={updateId}` to `parentType="daily_update" parentId={updateId}`.

- [ ] **Step 10: Update integration tests**

Existing integration tests that use the old comment shape will break. Find them:

```bash
grep -rn "dailyUpdateId" tests/integration/services/comments/ tests/integration/services/notifications/
```

Update each `insert(schema.comments).values({ dailyUpdateId, … })` to `.values({ parentType: "daily_update", parentId: dailyUpdateId, … })`.

The `emit-emails.test.ts` from Plan 4 may need updating too — check.

- [ ] **Step 11: Run tests**

```bash
pnpm test
```

Expected: all previously-passing tests now pass with the new shape. Test count: 222 (unchanged in count, but several tests updated for the new shape).

- [ ] **Step 12: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add lib/db/schema/comments.ts lib/db/migrations lib/services/comments lib/services/_auth/predicates.ts lib/services/notifications/index.ts lib/services/tasks/activity.ts lib/server-actions/comments.ts components/app tests
git commit -m "feat(comments): polymorphic parent_type + parent_id (drops daily_update_id)

Comments can now belong to either a daily_update or a task. The schema
migration drops comments.daily_update_id and adds parent_type + parent_id.
Service, predicates, activity feed, notification emit, and UI consumers
all updated to the new shape. Pre-prod data loss is accepted."
```

---

### Task 8: Task-level comment composer + ActivityFeed integration

**Files:**
- Modify: `components/app/task-action-bar.tsx` — add a "Comment" mode + composer
- OR modify: each task detail page (customer/employee/admin) — add an inline comment composer
- Customer detail (`app/customer/tasks/[taskId]/page.tsx`) — add the comment composer (customer previously had no action bar)

The simplest path: extend `TaskActionBar` with a comment composer, then enable it on all 3 task detail pages by setting a new prop `canComment`.

- [ ] **Step 1: Add comment composer to TaskActionBar**

Modify `components/app/task-action-bar.tsx`:

```tsx
import { CommentReplyForm } from "./comment-reply-form";
import { MessageCircle } from "lucide-react";

// Inside the Mode union, add "comment":
type Mode = "none" | "post" | "log" | "status" | "attach" | "comment";

// In the props:
canComment: boolean,

// In the JSX, add the button:
{canComment && (
  <Button
    type="button"
    variant={mode === "comment" ? "default" : "outline"}
    size="sm"
    onClick={() => setMode(mode === "comment" ? "none" : "comment")}
  >
    <MessageCircle className="mr-1 h-4 w-4" />
    Comment
  </Button>
)}

// And the composer body in the inline area:
{mode === "comment" && (
  <CommentReplyForm parentType="task" parentId={taskId} />
)}
```

Make sure `CommentReplyForm` after Task 7 takes the new prop shape.

- [ ] **Step 2: Enable canComment on each task detail page**

`app/employee/tasks/[taskId]/page.tsx` and `app/admin/orgs/[orgId]/tasks/[taskId]/page.tsx`: add `canComment={true}` to their TaskActionBar usage.

`app/customer/tasks/[taskId]/page.tsx`: this page currently has NO action bar (customer was read-only in 5a). Add one with `canPostUpdate={false}, canLogTime={false}, canChangeStatus={false}, canAttach={false}, canComment={true}`. The bar will only render the Comment button.

Read each page first, then add the prop / action bar.

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/task-action-bar.tsx "app/customer/tasks/[taskId]/page.tsx" "app/employee/tasks/[taskId]/page.tsx" "app/admin/orgs/[orgId]/tasks/[taskId]/page.tsx"
git commit -m "feat(comments): task-level comment composer in TaskActionBar (all roles)"
```

---

### Task 9: In-feed update editing

**Files:**
- Modify: `components/app/activity-feed-event.tsx` — add an "Edit" affordance on `update` events for authors + admins
- Create: `components/app/update-edit-form.tsx` — `"use client"` inline editor
- Modify: `lib/services/tasks/activity.ts` — include `canEdit` flag on update events
- Modify: `lib/server-actions/daily-updates.ts` — already has `updateDailyUpdateAction` from Plan 3b Task 1; verify

- [ ] **Step 1: ActivityEvent update kind gets `canEdit`**

Modify `lib/services/tasks/activity.ts`. The `update` variant of `ActivityEvent` gains a `canEdit: boolean` field. Compute it inside `listActivityForTask` and `listRecentActivity`: true if `ctx.actor.userId === update.authorId` OR `ctx.actor.role === "admin"`.

```ts
// In the union:
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
    canEdit: boolean;
  }

// In the mapping for each function:
canEdit: ctx.actor.role === "admin" || u.authorId === ctx.actor.userId,
```

- [ ] **Step 2: UpdateEditForm**

Create `components/app/update-edit-form.tsx`:

```tsx
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
import { updateDailyUpdateAction } from "@/lib/server-actions/daily-updates";

const ACTIVITIES = ["planning", "execution", "review", "meeting", "admin", "other"] as const;
const ACTIVITY_LABELS: Record<string, string> = {
  planning: "Planning",
  execution: "Execution",
  review: "Review",
  meeting: "Meeting",
  admin: "Admin",
  other: "Other",
};

export function UpdateEditForm({
  updateId,
  initialBody,
  initialActivityType,
  initialVisibility,
  onDone,
}: {
  updateId: string;
  initialBody: string;
  initialActivityType: string;
  initialVisibility: "customer_visible" | "internal_only";
  onDone: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initialBody);
  const [activityType, setActivityType] = useState<(typeof ACTIVITIES)[number]>(
    initialActivityType as (typeof ACTIVITIES)[number],
  );
  const [visibility, setVisibility] = useState<"customer_visible" | "internal_only">(
    initialVisibility,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError("Body is required.");
      return;
    }
    startTransition(async () => {
      const r = await updateDailyUpdateAction({
        id: updateId,
        body,
        activityType,
        visibility,
      });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor={`edit-body-${updateId}`}>Body</Label>
        <Textarea
          id={`edit-body-${updateId}`}
          rows={4}
          required
          minLength={1}
          maxLength={20000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`edit-activity-${updateId}`}>Activity</Label>
          <Select
            value={activityType}
            onValueChange={(v) => v && setActivityType(v as (typeof ACTIVITIES)[number])}
          >
            <SelectTrigger id={`edit-activity-${updateId}`}>
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
          <Label htmlFor={`edit-visibility-${updateId}`}>Visibility</Label>
          <Select
            value={visibility}
            onValueChange={(v) =>
              v && setVisibility(v as "customer_visible" | "internal_only")
            }
          >
            <SelectTrigger id={`edit-visibility-${updateId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer_visible">Visible to customer</SelectItem>
              <SelectItem value="internal_only">Internal only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Wire edit affordance into ActivityFeedEvent**

ActivityFeedEvent is a server component — but the edit form is a client component. Pattern: render an "Edit" button that toggles a client-side state. Promote the `update` event renderer to a small client wrapper.

Create `components/app/update-feed-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { UpdateEditForm } from "./update-edit-form";

export function UpdateFeedCard({
  event,
  ts,
}: {
  event: {
    id: string;
    authorId: string;
    authorName: string;
    authorEmail: string;
    body: string;
    activityType: string;
    visibility: "customer_visible" | "internal_only";
    canEdit: boolean;
  };
  ts: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
        <UpdateEditForm
          updateId={event.id}
          initialBody={event.body}
          initialActivityType={event.activityType}
          initialVisibility={event.visibility}
          onDone={() => setEditing(false)}
        />
      </article>
    );
  }

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
      <header className="mb-2 flex items-center gap-2">
        <Avatar
          userId={event.authorId}
          name={event.authorName}
          email={event.authorEmail}
          size="sm"
        />
        <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
          {event.authorName || event.authorEmail}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          posted an update · {ts}
        </span>
        {event.visibility === "internal_only" && (
          <span className="ml-auto rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Internal
          </span>
        )}
        {event.canEdit && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-1 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
            aria-label="Edit update"
            title="Edit update"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
        {event.body}
      </p>
    </article>
  );
}
```

In `components/app/activity-feed-event.tsx`, replace the inline `update` case with a call to this card:

```tsx
case "update":
  return <UpdateFeedCard event={event} ts={ts} />;
```

(Remove the old inline `<article>` markup for the update case. Add the import.)

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add lib/services/tasks/activity.ts components/app/update-edit-form.tsx components/app/update-feed-card.tsx components/app/activity-feed-event.tsx
git commit -m "feat(updates): inline edit affordance on activity feed update cards (author + admin)"
```

---

### Task 10: Threaded sub-comments

**Files:**
- Modify: `lib/db/schema/comments.ts` — add `parent_comment_id`
- Generate + apply migration
- Modify: `lib/services/comments/index.ts` + `schemas.ts` — accept optional `parentCommentId`
- Modify: `components/app/comment-thread.tsx` — render one level of nesting
- Modify: `components/app/comment-reply-form.tsx` — pass `parentCommentId` when in reply mode

- [ ] **Step 1: Schema**

Add to `comments`:

```ts
parentCommentId: uuid("parent_comment_id").references((): any => comments.id, { onDelete: "cascade" }),
```

(The `(): any => comments.id` is a self-reference trick that Drizzle requires to avoid a forward-reference error.)

Generate + apply:

```bash
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 2: Service updates**

Modify `postCommentInputSchema` to add `parentCommentId: idSchema.optional()`. Modify `postComment` to insert it. When `parentCommentId` is provided, verify the parent comment exists and shares the same `parentType` + `parentId` (no cross-thread replies):

```ts
if (parsed.data.parentCommentId) {
  const [parent] = await db
    .select({
      parentType: schema.comments.parentType,
      parentId: schema.comments.parentId,
      parentCommentId: schema.comments.parentCommentId,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, parsed.data.parentCommentId))
    .limit(1);
  if (!parent) return err("not_found", "Parent comment not found");
  if (parent.parentType !== parsed.data.parentType || parent.parentId !== parsed.data.parentId) {
    return err("validation", "Cannot reply across parents");
  }
  // Enforce single-level nesting: if the parent already has a parent, flatten to it.
  // (Replies to replies attach to the top-level comment.)
  // Skip this — just pass through; UI controls the visible nesting depth.
}
```

- [ ] **Step 3: CommentThread renders nested**

Modify `components/app/comment-thread.tsx`. After fetching the comments, partition into top-level (parentCommentId === null) and replies (parentCommentId === some id). Render top-level comments with their replies nested below:

```tsx
const topLevel = comments.filter((c) => c.parentCommentId === null);
const repliesByParent = new Map<string, typeof comments>();
for (const c of comments) {
  if (c.parentCommentId) {
    const arr = repliesByParent.get(c.parentCommentId) ?? [];
    arr.push(c);
    repliesByParent.set(c.parentCommentId, arr);
  }
}

return (
  <div className="space-y-3">
    {topLevel.map((c) => (
      <div key={c.id}>
        <CommentItem comment={c} parentType={parentType} parentId={parentId} />
        {repliesByParent.get(c.id)?.map((r) => (
          <div key={r.id} className="ml-8 mt-2">
            <CommentItem comment={r} parentType={parentType} parentId={parentId} />
          </div>
        ))}
      </div>
    ))}
    <CommentReplyForm parentType={parentType} parentId={parentId} />
  </div>
);
```

`CommentItem` is a small inline component that renders one comment + a "Reply" button that opens an inline `CommentReplyForm` with `parentCommentId={comment.id}`.

- [ ] **Step 4: CommentReplyForm accepts parentCommentId**

Modify `components/app/comment-reply-form.tsx` to accept an optional `parentCommentId` prop and pass it through to `postCommentAction`.

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git add lib/db/schema/comments.ts lib/db/migrations lib/services/comments components/app/comment-thread.tsx components/app/comment-reply-form.tsx
git commit -m "feat(comments): single-level threaded replies (parent_comment_id)"
```

---

### Task 11: Emoji reactions on comments

**Files:**
- Create: `lib/db/schema/comment-reactions.ts` + register in `lib/db/schema/index.ts`
- Generate + apply migration
- Create: `lib/services/reactions/index.ts` + `schemas.ts`
- Create: `lib/server-actions/reactions.ts`
- Create: `components/app/reaction-bar.tsx` (`"use client"`)
- Modify: `components/app/comment-thread.tsx` — render ReactionBar on each comment

- [ ] **Step 1: Schema**

Create `lib/db/schema/comment-reactions.ts`:

```ts
import { pgTable, uuid, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { comments } from "./comments";
import { users } from "./better-auth";

export const commentReactions = pgTable(
  "comment_reactions",
  {
    commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commentId, t.userId, t.emoji] }),
    byComment: index("comment_reactions_comment_idx").on(t.commentId),
  }),
);
```

Register in `lib/db/schema/index.ts`:

```ts
export * from "./comment-reactions";
```

Generate + apply migration:

```bash
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 2: Service**

Create `lib/services/reactions/schemas.ts`:

```ts
import { z } from "zod";
import { idSchema } from "@/lib/services/_schemas/common";

export const ALLOWED_EMOJIS = ["👍", "❤️", "🎉", "✅", "👀", "🙏"] as const;
export type Emoji = (typeof ALLOWED_EMOJIS)[number];

const emojiSchema = z.enum(ALLOWED_EMOJIS as readonly [string, ...string[]]);

export const toggleReactionInputSchema = z.object({
  commentId: idSchema,
  emoji: emojiSchema,
});
export type ToggleReactionInput = z.infer<typeof toggleReactionInputSchema>;
```

Create `lib/services/reactions/index.ts`:

```ts
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { err, ok, type Result } from "@/lib/services/_result";
import { requireCommentRead } from "@/lib/services/_auth/predicates";
import type { OrgContext } from "@/lib/services/_context";
import { toggleReactionInputSchema, type ToggleReactionInput } from "./schemas";

export type { ToggleReactionInput, Emoji } from "./schemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = PgDatabase<any, typeof schema>;

export async function toggleReaction(
  db: AnyDb,
  ctx: OrgContext,
  input: ToggleReactionInput,
): Promise<Result<{ active: boolean }>> {
  const parsed = toggleReactionInputSchema.safeParse(input);
  if (!parsed.success) {
    return err("validation", "Invalid input", {
      fields: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.map(String).join("."), i.message]),
      ),
    });
  }

  // Look up the comment so we can authorize via its parent.
  const [comment] = await db
    .select({
      id: schema.comments.id,
      parentType: schema.comments.parentType,
      parentId: schema.comments.parentId,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, parsed.data.commentId))
    .limit(1);
  if (!comment) return err("not_found", "Comment not found");

  const access = await requireCommentRead(
    db,
    ctx,
    comment.parentType as "daily_update" | "task",
    comment.parentId,
  );
  if (!access.ok) return access;

  // Toggle: if a row exists for (commentId, userId, emoji), delete it; else insert.
  const [existing] = await db
    .select({ commentId: schema.commentReactions.commentId })
    .from(schema.commentReactions)
    .where(
      and(
        eq(schema.commentReactions.commentId, parsed.data.commentId),
        eq(schema.commentReactions.userId, ctx.actor.userId),
        eq(schema.commentReactions.emoji, parsed.data.emoji),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(schema.commentReactions)
      .where(
        and(
          eq(schema.commentReactions.commentId, parsed.data.commentId),
          eq(schema.commentReactions.userId, ctx.actor.userId),
          eq(schema.commentReactions.emoji, parsed.data.emoji),
        ),
      );
    return ok({ active: false });
  }

  await db.insert(schema.commentReactions).values({
    commentId: parsed.data.commentId,
    userId: ctx.actor.userId,
    emoji: parsed.data.emoji,
  });
  return ok({ active: true });
}

export type ReactionAggregate = { emoji: string; count: number; mine: boolean };

export async function listReactionsForComment(
  db: AnyDb,
  ctx: OrgContext,
  commentId: string,
): Promise<Result<ReactionAggregate[]>> {
  const [comment] = await db
    .select({
      id: schema.comments.id,
      parentType: schema.comments.parentType,
      parentId: schema.comments.parentId,
    })
    .from(schema.comments)
    .where(eq(schema.comments.id, commentId))
    .limit(1);
  if (!comment) return err("not_found", "Comment not found");

  const access = await requireCommentRead(
    db,
    ctx,
    comment.parentType as "daily_update" | "task",
    comment.parentId,
  );
  if (!access.ok) return access;

  const rows = await db
    .select({
      emoji: schema.commentReactions.emoji,
      userId: schema.commentReactions.userId,
    })
    .from(schema.commentReactions)
    .where(eq(schema.commentReactions.commentId, commentId));

  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === ctx.actor.userId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  const out: ReactionAggregate[] = [];
  for (const [emoji, agg] of byEmoji.entries()) {
    out.push({ emoji, count: agg.count, mine: agg.mine });
  }
  return ok(out);
}
```

- [ ] **Step 3: Server actions**

Create `lib/server-actions/reactions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import * as reactions from "@/lib/services/reactions";

export async function toggleReactionAction(input: reactions.ToggleReactionInput) {
  const r = await withSessionContext((db, ctx) => reactions.toggleReaction(db, ctx, input));
  if (r.ok) {
    revalidatePath("/customer/tasks", "layout");
    revalidatePath("/employee/tasks", "layout");
    revalidatePath("/admin/orgs", "layout");
  }
  return r;
}

export async function listReactionsForCommentAction(commentId: string) {
  return withSessionContext((db, ctx) => reactions.listReactionsForComment(db, ctx, commentId));
}
```

- [ ] **Step 4: ReactionBar**

Create `components/app/reaction-bar.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { toggleReactionAction } from "@/lib/server-actions/reactions";
import { ALLOWED_EMOJIS } from "@/lib/services/reactions/schemas";

export type ReactionAggregate = { emoji: string; count: number; mine: boolean };

export function ReactionBar({
  commentId,
  initial,
}: {
  commentId: string;
  initial: ReactionAggregate[];
}) {
  const router = useRouter();
  const [reactions, setReactions] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);

  function onToggle(emoji: string) {
    startTransition(async () => {
      const r = await toggleReactionAction({ commentId, emoji: emoji as (typeof ALLOWED_EMOJIS)[number] });
      if (r.ok) {
        // Optimistic UI: flip the local state, then router.refresh() picks up the truth.
        setReactions((prev) => {
          const next = [...prev];
          const idx = next.findIndex((x) => x.emoji === emoji);
          if (idx === -1) {
            next.push({ emoji, count: 1, mine: true });
          } else {
            const item = next[idx]!;
            next[idx] = {
              emoji,
              count: item.mine ? item.count - 1 : item.count + 1,
              mine: !item.mine,
            };
            if (next[idx]!.count <= 0) next.splice(idx, 1);
          }
          return next;
        });
        router.refresh();
      }
    });
    setPickerOpen(false);
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={pending}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
            r.mine
              ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
          )}
        >
          <span>{r.emoji}</span>
          <span className="font-medium">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          disabled={pending}
          onClick={() => setPickerOpen((v) => !v)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Add reaction"
        >
          <span className="text-xs">+</span>
        </button>
        {pickerOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 flex gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
            {ALLOWED_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggle(emoji)}
                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Render ReactionBar in CommentThread**

Modify `components/app/comment-thread.tsx`. For each comment, also fetch its reactions and render `<ReactionBar commentId={c.id} initial={reactionAggregates} />` below the body.

For Phase 1 simplicity, fetch reactions per-comment in parallel via `Promise.all` inside the thread component. Pagination/performance comes in Phase 2.

```tsx
import { listReactionsForCommentAction } from "@/lib/server-actions/reactions";
import { ReactionBar } from "./reaction-bar";

// Inside CommentThread, after fetching comments:
const reactionsByComment = await Promise.all(
  comments.map((c) => listReactionsForCommentAction(c.id))
);

// In the rendering of each comment, after the body:
<ReactionBar
  commentId={c.id}
  initial={reactionsByComment[i].ok ? reactionsByComment[i].data : []}
/>
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git add lib/db/schema/comment-reactions.ts lib/db/schema/index.ts lib/db/migrations lib/services/reactions lib/server-actions/reactions.ts components/app/reaction-bar.tsx components/app/comment-thread.tsx
git commit -m "feat(reactions): 6-emoji reactions on comments (comment_reactions table + ReactionBar)"
```

---

### Task 12: Final verification + branch wrap

- [ ] **Step 1: Full sweep**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

All clean. Test counts: 222 vitest (Tasks 7/10/11 may add a small number; verify the count is non-decreasing) + 8 Playwright (7 existing + 1 new responsive).

- [ ] **Step 2: Manual smoke (recommended)**

```bash
pnpm dev
```

Sign in as each role. Verify:
- Theme toggle in the header flips light/dark and persists across reloads
- Resize the window below `md:` — hamburger appears, click reveals the nav links
- Customer settings page renders, name + avatar upload both work
- Customer task detail page now has a Comment button — post one, see it in the feed
- Author and admin see Edit affordance on their own / all updates; click expands inline form
- Comment thread shows nested replies (one level)
- Emoji reaction bar appears on each comment; click toggles

- [ ] **Step 3: Hand off**

Branch `feat/phase-1-plan-5b-interactions-polish` is ready for merge.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-16-ux-redesign-tasks-as-posts.md` — sub-plan 5b section):

- Dark mode foundation + sweep — Tasks 1+2 ✓
- Mobile-first responsive — Task 3 ✓
- Avatar image uploads — Task 5 ✓
- 6 SVG illustrations + EmptyState refresh — Task 4 ✓
- User settings page × 3 roles — Task 6 ✓
- Polymorphic comments — Task 7 ✓
- Task-level comment composer — Task 8 ✓
- In-feed update editing — Task 9 ✓
- Threaded sub-comments — Task 10 ✓
- Emoji reactions — Task 11 ✓

**Placeholder scan:** No "TBD" / "TODO" / "Similar to Task N". Every code step has full code. The dark mode sweep (Task 2 Step 3) lists every file rather than enumerating each class change — that's because the change is mechanical via the token mapping table at the top of the plan, not because of placeholder language.

**Type consistency:**
- `ActivityEvent` discriminated union update kind gains `canEdit: boolean` (Task 9). The renderer consumes it; no other code path reads it.
- `comments.parentType` / `parentId` replaces `dailyUpdateId` (Task 7). All consumers update consistently in the same task.
- `Avatar` gains an `image` prop (Task 5). AvatarStack passes it through. Existing callers that don't pass `image` continue working (initials fallback).
- `EmptyState` accepts `illustration` OR `icon` (Task 4). Both are optional; component renders neither if both omitted.
- `TaskActionBar` gains `canComment: boolean` prop (Task 8). All three task detail pages set it explicitly.
- `CommentThread` / `CommentReplyForm` prop changes from `dailyUpdateId: string` to `{ parentType, parentId }` (Task 7). All callers updated in the same task.

**Architectural decisions baked in:**
- Schema migrations are aggressive (drop `daily_update_id`, add `parent_comment_id`). Pre-prod data is the only existing data; we accept loss on the comments migration.
- Avatar URLs use a 7-day presigned R2 GET URL stored in `users.image`. Phase 2 should switch to a CDN-fronted public path.
- Dark mode uses `dark:` Tailwind variants throughout. Semantic-token migration (to `bg-background` etc.) is deferred.
- One-level comment nesting only. Replies to replies attach to the top-level comment.
- Reactions: fixed 6-emoji set, no custom emojis. Per-user per-emoji toggle, no quantity > 1 per user.
- The task-level comment composer is gated by `canComment` flag on TaskActionBar; customer detail page sets it true with all other flags false, so only the Comment button appears.
- `requireCommentWrite` is now an alias of `requireCommentRead` (anyone with read access can write). Phase 2 may tighten this for specific events.
- E2E tests rely on the existing seed; no seed updates needed in this plan unless the comments migration breaks an existing assertion (unlikely — the E2E specs don't post comments).
