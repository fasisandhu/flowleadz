# Phase 1 — Plan 6: Merge flowleadz site + deploy to Vercel

## Goal

Bring the FlowLeadz public website (currently in `C:\Users\User\Downloads\flowleadz`,
deployed via Firebase App Hosting to flowleadz.com) into this CRM repo as a single
Next 15 app. Deploy the combined app to Vercel with Neon Postgres. flowleadz.com
serves both the public landing site and the CRM behind a single domain.

## Resulting structure

```
app/
├── (site)/                  ← NEW — public site route group
│   ├── layout.tsx           ← public layout (no auth, no realtime)
│   ├── page.tsx             ← / (landing page)
│   └── site.css             ← scoped CSS, ported from agency globals.css
├── (auth)/                  ← existing
├── customer/                ← existing
├── employee/                ← existing
├── admin/                   ← existing
├── api/
│   ├── auth/                ← existing
│   ├── events/stream/       ← existing
│   ├── contact/             ← NEW — Resend lead form
│   └── cal-webhook/         ← NEW — Cal.com booking webhook
├── globals.css              ← existing CRM Tailwind
└── layout.tsx               ← existing root (minor edits for fonts)

components/
├── site/                    ← NEW — agency components, namespaced
│   ├── Nav.tsx
│   ├── Hero.tsx
│   ├── Footer.tsx
│   ├── ... (18 files)
└── ... (existing CRM components)

lib/
├── site/                    ← NEW — agency lib
│   ├── email.ts
│   └── storage.ts
└── ... (existing CRM lib)

public/
├── logo-full.png            ← NEW
├── logo-mark.png            ← NEW
└── ... (existing CRM public)
```

## Decisions locked

- **Deploy target:** Vercel + Neon Postgres.
- **Route group naming:** `(site)` — public, marketing-agnostic.
- **Root route (`/`):** Serves the public landing page. Authenticated users see
  the marketing site too; nav links them to their role dashboard.
- **Theme system:** Class-based (`<html class="dark">`) via next-themes. Agency
  CSS rewritten from `[data-theme='dark']` to `.dark` selectors.
- **CSS isolation:** Agency CSS vars (`--bg`, `--surface`, `--ink`, etc.) live
  inside a scoped CSS module imported only by `(site)/layout.tsx` and wrapped
  under a `.site-scope` class. They cannot leak into CRM routes.

## Out of scope

- Decommissioning the Firebase App Hosting deployment (manual after we verify Vercel works).
- Migrating agency leads data (Airtable/Sheets) — those integrations carry over via env vars.
- Custom 404/500 pages for the site (Phase 2 polish).
- Changing the agency's visual design — port as-is, just isolate it.

---

## Phase A — Merge the codebases

### Task 1: Add the `(site)` route group skeleton

**Files:**
- Create `app/(site)/layout.tsx`
- Create `app/(site)/page.tsx` (placeholder, real content lands in Task 4)
- Create `app/(site)/site.css` (empty, real content lands in Task 5)

Goal: prove the route group is wired before moving real content.

```tsx
// app/(site)/layout.tsx
import "./site.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site-scope">{children}</div>;
}
```

```tsx
// app/(site)/page.tsx
export default function SiteRoot() {
  return <h1>FlowLeadz site placeholder</h1>;
}
```

```bash
# Delete the current redirect — (site) takes over /
rm app/page.tsx
```

**Verify:**
```bash
pnpm dev
# Visit http://localhost:3000/ — should see "FlowLeadz site placeholder"
# Visit http://localhost:3000/login — should still work
# Visit http://localhost:3000/customer/dashboard — should still work (with auth)
```

Commit: `feat(site): scaffold (site) route group, drop CRM root redirect`

---

### Task 2: Copy public assets

```bash
cp C:/Users/User/Downloads/flowleadz/public/logo-full.png public/
cp C:/Users/User/Downloads/flowleadz/public/logo-mark.png public/
```

Commit: `feat(site): copy FlowLeadz logos to public/`

---

### Task 3: Copy and namespace agency components

For each file in `C:/Users/User/Downloads/flowleadz/components/`, copy to
`components/site/`:

| Source (agency) | Destination | Notes |
|---|---|---|
| `Automation.tsx` | `components/site/Automation.tsx` | |
| `CalEmbed.tsx` | `components/site/CalEmbed.tsx` | |
| `ContactForm.tsx` | `components/site/ContactForm.tsx` | |
| `FinalCTA.tsx` | `components/site/FinalCTA.tsx` | |
| `Footer.tsx` | `components/site/Footer.tsx` | |
| `Hero.tsx` | `components/site/Hero.tsx` | |
| `Logo.tsx` | `components/site/Logo.tsx` | Renamed import path only (component name stays `Logo`) |
| `Nav.tsx` | `components/site/Nav.tsx` | Will get the "Sign in" button in Task 6 |
| `PipelineVisual.tsx` | `components/site/PipelineVisual.tsx` | |
| `Problem.tsx` | `components/site/Problem.tsx` | |
| `Process.tsx` | `components/site/Process.tsx` | |
| `Results.tsx` | `components/site/Results.tsx` | |
| `Reveal.tsx` | `components/site/Reveal.tsx` | |
| `Section.tsx` | `components/site/Section.tsx` | |
| `Services.tsx` | `components/site/Services.tsx` | |
| `Solution.tsx` | `components/site/Solution.tsx` | |
| `ThemeToggle.tsx` | `components/site/ThemeToggle.tsx` | **Delete** — replaced by CRM's class-based theme toggle. The site can use the CRM's existing one if needed, OR no toggle on the site at all (most marketing sites don't expose one). Decision: skip the site theme toggle. |
| `WhyUs.tsx` | `components/site/WhyUs.tsx` | |

Inside each copied file:
- Update import paths from `@/components/...` to `@/components/site/...`
- Update import paths from `@/lib/...` to `@/lib/site/...` where they reference
  agency-specific modules (email, storage).

Commit: `feat(site): copy + namespace agency components into components/site/`

---

### Task 4: Wire up the real landing page

Replace `app/(site)/page.tsx` placeholder with the full agency landing:

```tsx
import Nav from "@/components/site/Nav";
import Hero from "@/components/site/Hero";
import Problem from "@/components/site/Problem";
import Solution from "@/components/site/Solution";
import Automation from "@/components/site/Automation";
import Services from "@/components/site/Services";
import Process from "@/components/site/Process";
import Results from "@/components/site/Results";
import WhyUs from "@/components/site/WhyUs";
import FinalCTA from "@/components/site/FinalCTA";
import Footer from "@/components/site/Footer";

export default function SiteRoot() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <Automation />
        <Services />
        <Process />
        <Results />
        <WhyUs />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
```

Update `app/(site)/layout.tsx` to set the site-specific page title via
`generateMetadata` or static `export const metadata`:

```tsx
import "./site.css";

export const metadata = {
  title: "FlowLeadz — Your Revenue, On Autopilot",
  description:
    "Done-for-you Meta ads, automation, CRM, and organic growth for contractors and operators.",
  openGraph: {
    title: "FlowLeadz — Your Revenue, On Autopilot",
    description:
      "Done-for-you Meta ads, automation, CRM, and organic growth for contractors and operators.",
    type: "website",
    images: ["/logo-full.png"],
  },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="site-scope">{children}</div>;
}
```

Commit: `feat(site): wire FlowLeadz landing page into (site) route group`

---

### Task 5: Port agency CSS, scoped under `.site-scope`

Open `C:/Users/User/Downloads/flowleadz/app/globals.css` and copy its contents
into `app/(site)/site.css`. Then transform:

1. **Drop the Google Fonts `@import`** at the top of the file — Task 8 moves
   fonts to `next/font/google` for proper preload + SSR.

2. **Replace `:root` and `[data-theme='light']` selectors** with `.site-scope`:
   ```css
   /* before */
   :root,
   [data-theme='light'] { --bg: #FAFAF7; ... }

   /* after */
   .site-scope { --bg: #FAFAF7; ... }
   ```

3. **Replace `[data-theme='dark']` selectors** with `.dark .site-scope`:
   ```css
   /* before */
   [data-theme='dark'] { --bg: #08080F; ... }

   /* after */
   .dark .site-scope { --bg: #08080F; ... }
   ```

4. **Body styles** inside agency `globals.css` like `body { background: var(--bg); ... }`
   need to scope to `.site-scope` instead of `body` (otherwise they paint the
   entire CRM):
   ```css
   /* before */
   body { background: var(--bg); color: var(--ink); }

   /* after */
   .site-scope { background: var(--bg); color: var(--ink); min-height: 100vh; }
   ```

5. **Component classes** (`.hero-grid`, `.section`, etc.) inside `globals.css`
   keep their names — they're already class-scoped, so they only match inside
   `.site-scope` descendants.

**Verify:** Reload `/` and `/customer/dashboard`. The site should look like
flowleadz.com. The CRM dashboard should be visually unchanged.

Commit: `feat(site): port agency CSS, scoped under .site-scope`

---

### Task 6: Add "Sign in" button to the site Nav

Open `components/site/Nav.tsx`. Find the right-side of the header (where the
existing "Get a strategy call" CTA likely lives). Add a "Sign in" link before
or alongside it:

```tsx
import Link from "next/link";
// ...
<Link
  href="/login"
  className="text-sm font-medium text-[color:var(--t-mid)] hover:text-[color:var(--ink)]"
>
  Sign in
</Link>
```

Style choice: keep it as a quiet text link, not a primary CTA. The strategy
call CTA stays the primary action; "Sign in" is for existing customers and
should be visually secondary.

Also add a footer link in `components/site/Footer.tsx`:
```tsx
<Link href="/login">Customer login</Link>
```

Commit: `feat(site): add "Sign in" link in site Nav + Footer to CRM /login`

---

### Task 7: Copy agency lib + API routes

```bash
mkdir -p lib/site
cp C:/Users/User/Downloads/flowleadz/lib/email.ts lib/site/email.ts
cp C:/Users/User/Downloads/flowleadz/lib/storage.ts lib/site/storage.ts

mkdir -p app/api/contact app/api/cal-webhook
cp C:/Users/User/Downloads/flowleadz/app/api/contact/route.ts app/api/contact/route.ts
cp C:/Users/User/Downloads/flowleadz/app/api/cal-webhook/route.ts app/api/cal-webhook/route.ts
```

Inside `app/api/contact/route.ts` and `app/api/cal-webhook/route.ts`, update
imports:
- `from "@/lib/email"` → `from "@/lib/site/email"`
- `from "@/lib/storage"` → `from "@/lib/site/storage"`

Verify:
```bash
pnpm typecheck
```

Commit: `feat(site): port agency contact + cal-webhook API routes and lib`

---

### Task 8: Move fonts to `next/font/google`

The agency CSS imports Space Grotesk, Inter, JetBrains Mono via Google Fonts
`@import`. That blocks first paint. Switch to Next's font system in the root
layout so the site fonts are preloaded server-side.

In `app/layout.tsx`, add the fonts alongside the existing Geist:

```tsx
import { Geist, Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", subsets: ["latin"], display: "swap" });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], display: "swap" });

// then:
<html lang="en" className={`${geistSans.variable} ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
```

Inside `app/(site)/site.css`, the agency typography rules like
`font-family: 'Space Grotesk', sans-serif` need to switch to
`font-family: var(--font-space-grotesk), sans-serif`.

Commit: `feat(site): swap @import fonts for next/font/google variables`

---

### Task 9: Env vars

Append the agency's vars to `.env.example` (the public template; the user
sets real values in `.env` locally and on Vercel):

```bash
# --- FlowLeadz public site ---
NEXT_PUBLIC_SITE_URL=https://flowleadz.com
LEAD_TO_EMAIL=hello@flowleadz.com
LEAD_FROM_EMAIL="FlowLeadz Site <noreply@flowleadz.com>"

# Optional integrations (uncomment and set if you use them)
# RESEND_API_KEY=               # Already used by CRM for invite emails
# LEAD_WEBHOOK_URL=

# Airtable lead storage
# AIRTABLE_API_KEY=
# AIRTABLE_BASE_ID=
AIRTABLE_TABLE_NAME=Leads

# Google Sheets lead storage
# GOOGLE_SHEET_ID=
# GOOGLE_SERVICE_ACCOUNT_EMAIL=
# GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_SHEET_RANGE=Leads!A:H

# Cal.com booking
NEXT_PUBLIC_CAL_USERNAME=your-calcom-username
NEXT_PUBLIC_CAL_EVENT_SLUG=strategy-call
# CAL_WEBHOOK_SECRET=
# CAL_BOOKING_WEBHOOK_URL=
```

The user fills real values in their local `.env`.

Commit: `feat(site): add FlowLeadz env vars to .env.example`

---

### Task 10: Local verification

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

Smoke test:
1. `http://localhost:3000/` → FlowLeadz landing page, all sections render, theme
   toggle (CRM-wide one) flips both site and CRM colors correctly.
2. Click "Sign in" in nav → arrives at `/login`.
3. Sign in as `admin@e2e.test` → lands on `/admin/orgs/.../dashboard`.
4. Go back to `/` → still shows FlowLeadz landing (auth doesn't redirect away).
5. Contact form submission (if backend env vars are set) → email arrives.
6. CRM activity feed, task creation, etc. — confirm no regressions.

If everything passes, commit: `chore: Phase A merge verified locally`.

Merge to main.

---

## Phase B — Deploy to Vercel + Neon

### Task 11: Provision Neon Postgres

User-driven setup (record steps in repo notes, no code change):

1. Sign in to [console.neon.tech](https://console.neon.tech).
2. Create a new project: `flowleadz-crm` (or similar).
3. Use region close to expected user base (e.g. `us-east-2` if customers are US).
4. Copy the connection string from the Neon dashboard.
5. Locally:
   ```bash
   # Set in .env temporarily for migration:
   DATABASE_URL="<neon connection string>"
   pnpm db:migrate
   ```
6. Verify migrations applied: connect via Neon's SQL Editor, check that tables
   like `users`, `organizations`, `tasks`, `daily_updates`, `work_requests`,
   `comments`, `attachments`, `notifications`, etc. exist.

Note about LISTEN: Neon supports `LISTEN`/`NOTIFY` only on **pooled
connections via the standard Postgres protocol**, NOT on the HTTP/serverless
transport. Our `lib/db/listen-client.ts` already creates a fresh `pg.Client`
with a direct connection string — this works against Neon as long as the
connection string points to the **non-pooler endpoint** (the one without
`-pooler` in the hostname). Task 13 verifies this.

---

### Task 12: Provision Cloudflare R2 (already documented elsewhere, but
needed for attachments)

If not already done:
1. Cloudflare dashboard → R2 → Create bucket: `flowleadz-attachments`.
2. Generate an API token with read/write on that bucket.
3. Set the corresponding env vars (see existing CRM `.env.example` for names).

---

### Task 13: Verify SSE/LISTEN works against Neon

Locally with `DATABASE_URL` pointing at Neon's non-pooler endpoint:

```bash
pnpm start
```

In one terminal, tail any role's notification stream:
```
curl -N -H "Cookie: <session cookie>" http://localhost:3000/api/events/stream
```

In another, trigger a notify event (e.g. post a daily update from a different
user). The curl session should print the event within ~1s.

If LISTEN fails, the fix is to ensure `DATABASE_URL` points to the **direct
endpoint** (no `-pooler`), and that the SSE route uses `createListenClient()`
which makes a fresh `pg.Client` rather than the HTTP driver.

If still failing, fallback: use Neon's [pgbouncer endpoint in session mode]
(supports LISTEN; the default transaction-mode pooler doesn't).

---

### Task 14: Create Vercel project

1. Sign in to [vercel.com](https://vercel.com).
2. Import the GitHub repo (push this repo to GitHub first if not already).
3. Framework: Next.js (auto-detected).
4. Root directory: leave default (repo root).
5. Build command: `pnpm build` (auto-detected).
6. Output: leave default.
7. Add env vars (see Task 15).

### Task 15: Configure Vercel env vars

Set the following in Vercel project → Settings → Environment Variables, scoped
to all three (Production, Preview, Development):

**Core:**
- `DATABASE_URL` — Neon direct (non-pooler) connection string
- `NEXT_PUBLIC_SITE_URL` — `https://flowleadz.com`
- `BETTER_AUTH_SECRET` — generate fresh, 32+ random chars
- `BETTER_AUTH_URL` — `https://flowleadz.com`

**Email (Resend — used by both site contact form and CRM invites):**
- `RESEND_API_KEY`
- `LEAD_TO_EMAIL` — `hello@flowleadz.com`
- `LEAD_FROM_EMAIL` — `"FlowLeadz Site <noreply@flowleadz.com>"`

**R2:**
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`

**Site integrations (optional, fill what you use):**
- `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_NAME`
- `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEET_RANGE`
- `NEXT_PUBLIC_CAL_USERNAME`, `NEXT_PUBLIC_CAL_EVENT_SLUG`, `CAL_WEBHOOK_SECRET`, `CAL_BOOKING_WEBHOOK_URL`

**Anything else** the codebase reads via `process.env.*` — grep for it before deploy:
```bash
grep -rn "process.env\." lib app | grep -oE "process\.env\.[A-Z_]+" | sort -u
```

### Task 16: First Vercel deploy

Trigger a deploy by pushing to GitHub `main`. Watch the build log.

Likely first-deploy gotchas to expect:
- **Build fails on a missing env var**: add it, redeploy.
- **Build fails on a `console.log` or `useState` import**: fix and re-push.
- **Build succeeds but `/` returns 500**: check Vercel function logs.
- **SSE doesn't connect from the browser**: Vercel has a 300s max duration on
  serverless functions (we already cap at 280s in the route). Verify the
  function logs show the LISTEN handshake.

Once `https://<project>.vercel.app/` renders the FlowLeadz landing, move on.

### Task 17: Configure flowleadz.com on Vercel

In Vercel project → Settings → Domains:
1. Add `flowleadz.com` and `www.flowleadz.com`.
2. Vercel will give you DNS records (A record + CNAME).

In Hostinger DNS panel for flowleadz.com:
1. **Remove** the existing Firebase A/AAAA/CNAME records pointing to Firebase.
2. **Add** the records Vercel told you to add (usually `A 76.76.21.21` for apex
   + `CNAME cname.vercel-dns.com` for `www`).
3. DNS propagation takes 5–60 min.

Vercel auto-provisions SSL via Let's Encrypt. No manual cert work.

### Task 18: Production smoke test

Visit `https://flowleadz.com/`:
1. FlowLeadz landing renders, fonts loaded, theme works.
2. Contact form submits, emails arrive.
3. Cal.com embed loads (if configured).
4. "Sign in" in nav → `https://flowleadz.com/login`.
5. Sign up / sign in flow works end-to-end (invite a test admin via SQL or seed).
6. Create a project / task / update / comment in the CRM.
7. Open the same task in a second browser as a different user → realtime
   refresh fires within ~1s when you post an update in the first browser.
8. Search works (Cmd-K, results page).

If all clear, Phase B is done.

---

## Phase C — Cleanup

### Task 19: Decommission Firebase App Hosting (optional)

Once flowleadz.com is stably on Vercel for a day or two:
1. Firebase console → App Hosting → archive the old backend.
2. Cancel any Firebase billing if it was a paid project.
3. Archive the old `flowleadz` repo on GitHub (don't delete — preserves git
   history). Add a README note pointing to this monorepo.

### Task 20: Update docs

Update repo root `README.md`:
- Mention that the public site at `/` is the FlowLeadz marketing landing.
- Document the env vars added.
- Point to the deploy runbook (Task 11–18 here).

Add a `docs/runbooks/deploy.md` with the bare commands:
```bash
# Migrations
DATABASE_URL=<prod> pnpm db:migrate

# Deploy is automatic on push to main, but for manual rollback:
vercel rollback <deployment-id>
```

---

## Self-review

**Spec coverage:**
- FlowLeadz landing page ported into this repo — Tasks 3, 4
- Visual parity with current flowleadz.com — Task 5
- "Sign in" button visible on the public site — Task 6
- Single Next 15 app, single deployment — Phase A overall
- Vercel + Neon hosting — Phase B
- DNS pointed at the new host — Task 17

**Out of scope (deliberately):**
- Site-side CMS for marketing copy edits — Phase 2 candidate.
- A11y audit of merged styles — separate work.
- Visual regression tests for the site — separate work.
- Email magic-link signup for the site form (the Cal.com booking already provides this).

**Risks + mitigations:**
- **CSS leak from `.site-scope` into CRM:** Mitigation — every agency variable
  declaration is scoped under `.site-scope`. Verify with DevTools: on `/customer/dashboard`,
  no CSS variable starting with the agency tokens should be defined on `html`/`body`.
- **Theme system mismatch:** Mitigation — Task 5 rewrites all `[data-theme]`
  selectors to `.dark` so the agency styles respond to the CRM's theme switch.
- **Neon LISTEN limitation:** Mitigation — Task 11 + 13 verify against the
  non-pooler endpoint. If it fails, the fallback (pgbouncer session mode) is
  documented.
- **Vercel 300s timeout vs. SSE:** Already handled — SSE route uses
  `maxDuration = 280` and the client reconnects via `retry: 1000`.
- **Hostinger DNS propagation:** Mitigation — keep Firebase backend live until
  Vercel domain is verified working, then swap DNS.

---

## Execution path

Suggested order:

1. **Phase A as one branch** (`feat/phase-1-plan-6-merge-site`) — Tasks 1–10. Each
   task is a separate commit. Merge to main when local smoke passes.
2. **Phase B as a deployment session** (no branch, no code changes — just
   provisioning + DNS) — Tasks 11–18.
3. **Phase C** when comfortable — Tasks 19–20.

Phase A can be subagent-driven (10 small tasks, all mechanical). Phase B
needs the user (DNS access, Vercel/Neon dashboard access).
