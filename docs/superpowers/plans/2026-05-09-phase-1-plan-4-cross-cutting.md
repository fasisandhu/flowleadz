# Phase 1 — Plan 4: Cross-Cutting (Email Dispatch + Attachment UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire two cross-cutting capabilities that span all roles:
1. **Email delivery for work-request notifications** — extend the existing `emit()` helper so that when `notification_preferences.emailEnabled = true`, a transactional email is sent via Resend with a React-Email-rendered template. Phase 1 ships two templates: `work_request.submitted` (admin alert) and `work_request.status_changed` (customer alert).
2. **Attachment upload + display** — add reusable `AttachmentUpload` (client) and `AttachmentList` (server) components, plus a `getAttachmentDownloadUrlAction`. Integrate into the existing work-request and daily-update forms/detail pages. R2 + presigned URLs are already wired (Plan 1); the service layer (Plan 2c) is already in place. This task is UI integration only.

**Architecture:** Email rendering uses `@react-email/render`'s `render()` to convert React Email components → HTML + plain text. Templates live in `lib/email/templates/<event-type>.tsx` and are dispatched by an `eventType → component` registry in `lib/email/dispatch.ts`. Email failures are recorded in `notification_deliveries.status = "failed"` with the error message, but never throw out of `emit()` (so a Resend outage doesn't break the originating action).

Attachments use the existing `getUploadUrlAction` → R2 PUT → `confirmAttachmentAction` flow. The new download path is a server action that returns a 15-minute presigned GET URL, scoped by the same `authorizeAttachmentParentRead` check the list service uses. The `AttachmentList` server component renders `<a>` links with the presigned URL inlined into the HTML; pages that show attachments are already dynamic Server Components, so the links are regenerated each render.

**Tech Stack:** Same as Plans 1–3c. New runtime usage: `@react-email/render` (already installed), `resend` (already wired in `lib/email/send.ts`).

**Branch:** Implement on `feat/phase-1-cross-cutting`, branched from `main`. Last main commit at start: the Plan-3c merge (`4b920bc`).

---

## File structure created by this plan

```
lib/email/
  send.ts                          (existing — sendEmail wrapper around Resend)
  dispatch.ts                      (NEW — eventType → template registry; sendNotificationEmail helper)
  templates/
    layout.tsx                     (NEW — shared <Html>/<Head>/<Body> shell)
    work-request-submitted.tsx     (NEW — admin alert)
    work-request-status-changed.tsx (NEW — customer alert)

lib/services/notifications/
  index.ts                         (MODIFIED — emit() now also dispatches emails)

lib/server-actions/
  attachments.ts                   (MODIFIED — adds getAttachmentDownloadUrlAction)

components/app/
  attachment-upload.tsx            (NEW — "use client" — single-file upload widget)
  attachment-list.tsx              (NEW — server — display ready attachments with download links)

  work-request-form.tsx            (MODIFIED — adds AttachmentUpload after the request is submitted)
  daily-update-form.tsx            (MODIFIED — adds AttachmentUpload after the update is posted)

app/customer/requests/[requestId]/page.tsx        (MODIFIED — adds AttachmentList)
app/admin/orgs/[orgId]/work-requests/[requestId]/page.tsx  (MODIFIED — adds AttachmentList)
app/customer/projects/[projectId]/updates/[updateId]/page.tsx  (MODIFIED — adds AttachmentList)
app/employee/projects/[projectId]/updates/[updateId]/page.tsx  (MODIFIED — adds AttachmentList)

tests/integration/services/notifications/
  emit-emails.test.ts              (NEW — verifies email dispatch path)

tests/e2e/
  customer-request-attachment.spec.ts  (NEW — customer attaches a file)
```

---

## Tasks

### Task 1: Email render infrastructure

**Files:**
- Create: `lib/email/dispatch.ts`
- Create: `lib/email/templates/layout.tsx`

`lib/email/dispatch.ts` exposes:
- `sendNotificationEmail(eventType, payload, recipient): Promise<{ ok: true } | { ok: false, error: string }>` — looks up the template by event type, renders to HTML + plain text using `@react-email/render`'s `render()`, and calls `sendEmail`. Returns `{ ok: false, error }` on render or send failure (does not throw — callers want to log and continue).

Templates that don't exist yet (`comment.posted`, `task.*`, `daily_update.posted`) are absent from the registry — `sendNotificationEmail` returns `{ ok: false, error: "no template for event type" }` for them. That's the explicit Phase 1 scope decision: we record the email-channel delivery as `failed` with that error message, and the in-app row is unaffected.

- [ ] **Step 1: Layout (shared shell)**

`lib/email/templates/layout.tsx`:

```tsx
import { Body, Container, Head, Hr, Html, Preview, Section, Tailwind, Text } from "@react-email/components";
import * as React from "react";

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-50 font-sans">
          <Container className="mx-auto max-w-xl rounded-md border bg-white p-6">
            <Section>
              <Text className="text-sm text-slate-500">Marketing CRM</Text>
            </Section>
            {children}
            <Hr className="my-6 border-slate-200" />
            <Text className="text-xs text-slate-400">
              You received this email because notifications are enabled for this event. Sign in to change preferences.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
```

- [ ] **Step 2: Dispatcher**

`lib/email/dispatch.ts`:

```ts
import "server-only";
import { render } from "@react-email/render";
import * as React from "react";
import { sendEmail } from "@/lib/email/send";
import { log } from "@/lib/log";
import { WorkRequestSubmittedEmail, type WorkRequestSubmittedPayload } from "./templates/work-request-submitted";
import { WorkRequestStatusChangedEmail, type WorkRequestStatusChangedPayload } from "./templates/work-request-status-changed";

type Recipient = { userId: string; email: string; name: string | null };

type EmailRegistry = {
  "work_request.submitted": (payload: WorkRequestSubmittedPayload, recipient: Recipient) => {
    subject: string;
    component: React.ReactElement;
  };
  "work_request.status_changed": (payload: WorkRequestStatusChangedPayload, recipient: Recipient) => {
    subject: string;
    component: React.ReactElement;
  };
};

const REGISTRY: EmailRegistry = {
  "work_request.submitted": (payload, recipient) => ({
    subject: `New work request: ${payload.title}`,
    component: React.createElement(WorkRequestSubmittedEmail, { payload, recipient }),
  }),
  "work_request.status_changed": (payload, recipient) => ({
    subject: `Work request ${payload.to}: ${payload.title}`,
    component: React.createElement(WorkRequestStatusChangedEmail, { payload, recipient }),
  }),
};

export type SendNotificationEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Render and dispatch the email for a given notification event.
 *
 * Returns ok=false on render/send failure (does NOT throw). Callers should
 * persist the failure to notification_deliveries with the error message.
 */
export async function sendNotificationEmail(
  eventType: string,
  payload: unknown,
  recipient: Recipient,
): Promise<SendNotificationEmailResult> {
  const factory = REGISTRY[eventType as keyof EmailRegistry];
  if (!factory) {
    return { ok: false, error: `no template for event type "${eventType}"` };
  }

  let rendered: { html: string; text: string; subject: string };
  try {
    // The factory's payload type is checked at the registry-key level only;
    // we cast here because the runtime payload is whatever the service emitted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { subject, component } = (factory as any)(payload, recipient);
    const html = await render(component);
    const text = await render(component, { plainText: true });
    rendered = { html, text, subject };
  } catch (e) {
    log.warn({ err: e, eventType }, "sendNotificationEmail: render failed");
    return { ok: false, error: e instanceof Error ? e.message : "render failed" };
  }

  try {
    const r = await sendEmail({
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    return { ok: true, messageId: r.id };
  } catch (e) {
    log.warn({ err: e, eventType, to: recipient.email }, "sendNotificationEmail: send failed");
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
```

NOTE: This file imports the templates from Tasks 2 and 3, so those tasks must land before this file typechecks. Implement Task 2 + Task 3 in the same task as the dispatcher (one commit), OR temporarily comment out the imports/registry entries until those tasks are done. The cleanest path is: Task 1 = layout.tsx only; Task 2 = work-request-submitted template; Task 3 = work-request-status-changed template; Task 4 = dispatcher + wire-up to emit().

We will use the cleanest path:

**Step 1 (this task)** — Just create `lib/email/templates/layout.tsx`. Stop. Commit:

```bash
pnpm typecheck
pnpm lint
git add lib/email/templates/layout.tsx
git commit -m "feat(email): shared EmailLayout (Tailwind shell for templates)"
```

The dispatcher and the registry come in Task 4 once the templates exist.

---

### Task 2: Email template — `work_request.submitted`

**Files:**
- Create: `lib/email/templates/work-request-submitted.tsx`

The template is rendered when a customer submits a new work request. Sent to admins of the customer's org.

The notification payload from `lib/services/work-requests/index.ts` for this event is:
```ts
{
  workRequestId: string;
  title: string;
  actorId: string;       // the customer who submitted
}
```

We need a deep link. The deep link goes to `/admin/orgs/[orgId]/work-requests/[workRequestId]`. The orgId can be passed in via the payload OR derived later. To keep the email self-contained, we'll add `orgId` to the emit payload in Task 4 (small service-layer change).

For now, design the template to consume `orgId` + `workRequestId` + `title`:

- [ ] **Step 1: Implement**

```tsx
import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

export type WorkRequestSubmittedPayload = {
  workRequestId: string;
  orgId: string;
  title: string;
  appUrl: string;
};

export function WorkRequestSubmittedEmail({
  payload,
  recipient,
}: {
  payload: WorkRequestSubmittedPayload;
  recipient: { name: string | null };
}) {
  const reviewUrl = `${payload.appUrl}/admin/orgs/${payload.orgId}/work-requests/${payload.workRequestId}`;
  const greeting = recipient.name ? `Hi ${recipient.name},` : "Hi,";

  return (
    <EmailLayout preview={`New work request: ${payload.title}`}>
      <Heading className="text-xl font-semibold">New work request</Heading>
      <Text className="text-sm text-slate-700">{greeting}</Text>
      <Text className="text-sm text-slate-700">
        A customer just submitted a new work request titled:
      </Text>
      <Section className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <Text className="m-0 font-medium text-slate-900">{payload.title}</Text>
      </Section>
      <Section className="mt-6">
        <Button
          href={reviewUrl}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Review request →
        </Button>
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
pnpm lint
git add lib/email/templates/work-request-submitted.tsx
git commit -m "feat(email): work_request.submitted template (admin alert)"
```

The template won't be exercised yet — Task 4 wires it up. Typecheck/lint must still pass on the new file in isolation.

---

### Task 3: Email template — `work_request.status_changed`

**Files:**
- Create: `lib/email/templates/work-request-status-changed.tsx`

Sent to the customer who submitted, when admin accepts/rejects/marks-duplicate.

The notification payload:
```ts
{
  workRequestId: string;
  title: string;
  from: "submitted";
  to: "accepted" | "rejected" | "duplicate";
}
```

Deep link goes to `/customer/requests/[workRequestId]`. We need `orgId` too — Task 4 adds it to the emit payload alongside the other fields (admin's customer org).

Actually customers don't need orgId in the URL — `/customer/requests/[id]` works without orgId. So this template only needs `workRequestId, title, from, to, appUrl`.

- [ ] **Step 1: Implement**

```tsx
import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./layout";

export type WorkRequestStatusChangedPayload = {
  workRequestId: string;
  title: string;
  from: "submitted";
  to: "accepted" | "rejected" | "duplicate";
  appUrl: string;
};

const TO_LABEL: Record<WorkRequestStatusChangedPayload["to"], string> = {
  accepted: "accepted",
  rejected: "rejected",
  duplicate: "marked as duplicate",
};

const TO_DESCRIPTION: Record<WorkRequestStatusChangedPayload["to"], string> = {
  accepted: "Your request has been accepted. The team will get to work on it shortly.",
  rejected: "Your request has been rejected. Sign in for details.",
  duplicate: "Your request was identified as a duplicate of an existing one. The team is already on it.",
};

export function WorkRequestStatusChangedEmail({
  payload,
  recipient,
}: {
  payload: WorkRequestStatusChangedPayload;
  recipient: { name: string | null };
}) {
  const detailUrl = `${payload.appUrl}/customer/requests/${payload.workRequestId}`;
  const greeting = recipient.name ? `Hi ${recipient.name},` : "Hi,";

  return (
    <EmailLayout preview={`Your work request was ${TO_LABEL[payload.to]}`}>
      <Heading className="text-xl font-semibold">
        Work request {TO_LABEL[payload.to]}
      </Heading>
      <Text className="text-sm text-slate-700">{greeting}</Text>
      <Text className="text-sm text-slate-700">{TO_DESCRIPTION[payload.to]}</Text>
      <Section className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <Text className="m-0 font-medium text-slate-900">{payload.title}</Text>
      </Section>
      <Section className="mt-6">
        <Button
          href={detailUrl}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          View request →
        </Button>
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
pnpm lint
git add lib/email/templates/work-request-status-changed.tsx
git commit -m "feat(email): work_request.status_changed template (customer alert)"
```

---

### Task 4: Dispatcher + wire emit() to send emails

**Files:**
- Create: `lib/email/dispatch.ts`
- Modify: `lib/services/notifications/index.ts` — extend `emit()` to dispatch emails for `emailEnabled` recipients
- Modify: `lib/services/work-requests/index.ts` — add `orgId` and `appUrl` (or rely on env) to the email-bearing emit payloads
- Modify: `lib/services/notifications/schemas.ts` — add `appUrl?: string` to the EmitInput payload? — no, the dispatcher derives appUrl from env at call time. Cleaner.

The dispatcher reads `env.APP_URL` and adds it to the payload before passing to the template (so templates don't need to read env). Let's make `sendNotificationEmail` enrich the payload with appUrl:

- [ ] **Step 1: Dispatcher**

`lib/email/dispatch.ts`:

```ts
import "server-only";
import { render } from "@react-email/render";
import * as React from "react";
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { WorkRequestSubmittedEmail, type WorkRequestSubmittedPayload } from "./templates/work-request-submitted";
import { WorkRequestStatusChangedEmail, type WorkRequestStatusChangedPayload } from "./templates/work-request-status-changed";

type Recipient = { userId: string; email: string; name: string | null };

type RegistryEntry = {
  build: (rawPayload: unknown, recipient: Recipient, appUrl: string) => {
    subject: string;
    component: React.ReactElement;
  };
};

const REGISTRY: Record<string, RegistryEntry> = {
  "work_request.submitted": {
    build: (raw, recipient, appUrl) => {
      const p = raw as Omit<WorkRequestSubmittedPayload, "appUrl">;
      const payload: WorkRequestSubmittedPayload = { ...p, appUrl };
      return {
        subject: `New work request: ${payload.title}`,
        component: React.createElement(WorkRequestSubmittedEmail, { payload, recipient }),
      };
    },
  },
  "work_request.status_changed": {
    build: (raw, recipient, appUrl) => {
      const p = raw as Omit<WorkRequestStatusChangedPayload, "appUrl">;
      const payload: WorkRequestStatusChangedPayload = { ...p, appUrl };
      return {
        subject: `Work request ${payload.to}: ${payload.title}`,
        component: React.createElement(WorkRequestStatusChangedEmail, { payload, recipient }),
      };
    },
  },
};

export type SendNotificationEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendNotificationEmail(
  eventType: string,
  rawPayload: unknown,
  recipient: Recipient,
): Promise<SendNotificationEmailResult> {
  const entry = REGISTRY[eventType];
  if (!entry) {
    return { ok: false, error: `no template for event type "${eventType}"` };
  }

  let html: string;
  let text: string;
  let subject: string;
  try {
    const built = entry.build(rawPayload, recipient, env.APP_URL);
    subject = built.subject;
    html = await render(built.component);
    text = await render(built.component, { plainText: true });
  } catch (e) {
    log.warn({ err: e, eventType }, "sendNotificationEmail: render failed");
    return { ok: false, error: e instanceof Error ? e.message : "render failed" };
  }

  try {
    const r = await sendEmail({ to: recipient.email, subject, html, text });
    return { ok: true, messageId: r.id };
  } catch (e) {
    log.warn({ err: e, eventType, to: recipient.email }, "sendNotificationEmail: send failed");
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}
```

- [ ] **Step 2: Modify `emit()` in `lib/services/notifications/index.ts`**

After the in-app insertion block, add the email branch. Replace the current `emit()` body with:

```ts
export async function emit(db: AnyDb, input: EmitInput): Promise<void> {
  const parsed = emitInputSchema.parse(input);
  const uniqueRecipients = Array.from(new Set(parsed.recipientUserIds));

  const prefs = await resolvePreferences(db, parsed.orgId, parsed.eventType, uniqueRecipients);
  const inAppRecipients = prefs.filter((p) => p.inAppEnabled).map((p) => p.userId);
  const emailRecipientIds = prefs.filter((p) => p.emailEnabled).map((p) => p.userId);

  // 1. In-app
  let inAppNotifIds: { id: string; userId: string }[] = [];
  if (inAppRecipients.length > 0) {
    inAppNotifIds = await db
      .insert(schema.notifications)
      .values(
        inAppRecipients.map((userId) => ({
          orgId: parsed.orgId,
          userId,
          eventType: parsed.eventType,
          payload: parsed.payload,
          relatedType: parsed.relatedType ?? null,
          relatedId: parsed.relatedId ?? null,
        })),
      )
      .returning({ id: schema.notifications.id, userId: schema.notifications.userId });

    await db.insert(schema.notificationDeliveries).values(
      inAppNotifIds.map((row) => ({
        notificationId: row.id,
        channel: "in_app" as const,
        status: "sent" as const,
        sentAt: new Date(),
      })),
    );
  }

  // 2. Email — only for users with emailEnabled AND a valid email + a template registered.
  if (emailRecipientIds.length === 0) return;

  const userRows = await db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, emailRecipientIds));

  // Build a map: userId → corresponding in_app notification id (if any). Used so the
  // email-channel delivery row is linked to the same notification row.
  const userToNotifId = new Map(inAppNotifIds.map((r) => [r.userId, r.id]));

  for (const user of userRows) {
    const notifId = userToNotifId.get(user.id);
    if (!notifId) {
      // Email-only delivery: insert a notification row first so we have an id to attach the delivery to.
      const [row] = await db
        .insert(schema.notifications)
        .values({
          orgId: parsed.orgId,
          userId: user.id,
          eventType: parsed.eventType,
          payload: parsed.payload,
          relatedType: parsed.relatedType ?? null,
          relatedId: parsed.relatedId ?? null,
        })
        .returning({ id: schema.notifications.id });
      const newId = row!.id;

      const result = await sendNotificationEmail(parsed.eventType, parsed.payload, {
        userId: user.id,
        email: user.email,
        name: user.name ?? null,
      });
      await db.insert(schema.notificationDeliveries).values({
        notificationId: newId,
        channel: "email",
        status: result.ok ? "sent" : "failed",
        errorMessage: result.ok ? null : result.error,
        sentAt: result.ok ? new Date() : null,
      });
    } else {
      const result = await sendNotificationEmail(parsed.eventType, parsed.payload, {
        userId: user.id,
        email: user.email,
        name: user.name ?? null,
      });
      await db.insert(schema.notificationDeliveries).values({
        notificationId: notifId,
        channel: "email",
        status: result.ok ? "sent" : "failed",
        errorMessage: result.ok ? null : result.error,
        sentAt: result.ok ? new Date() : null,
      });
    }
  }
}
```

Add the import at the top of `lib/services/notifications/index.ts`:

```ts
import { sendNotificationEmail } from "@/lib/email/dispatch";
```

- [ ] **Step 3: Add `orgId` to the work-request emit payloads**

In `lib/services/work-requests/index.ts`, the four emit calls already include the right fields except some lack `orgId`. The `work_request.submitted` emit at line ~93 needs `orgId: ctx.orgId` in the payload (it's already on the emit envelope, but the email template wants it in the payload too). Looking at the existing call:

```ts
await emit(db, {
  orgId: ctx.orgId,
  eventType: "work_request.submitted",
  recipientUserIds: adminIds,
  payload: {
    workRequestId: updated!.id,
    title: updated!.title,
    actorId: ctx.actor.userId,
  },
  ...
});
```

The `orgId` is on the envelope. The email template needs it in the payload. Add it:

```ts
payload: {
  workRequestId: updated!.id,
  orgId: ctx.orgId,            // ← add this
  title: updated!.title,
  actorId: ctx.actor.userId,
},
```

The three `work_request.status_changed` emit calls (around lines ~181, ~269, ~343) do NOT need orgId in the payload (the customer URL is `/customer/requests/[id]`, no orgId in the path).

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
git checkout -b feat/phase-1-cross-cutting   # branch already exists; the controller created it
git add lib/email lib/services/notifications lib/services/work-requests
git commit -m "feat(notifications): dispatch emails for work-request events via Resend"
```

NOTE: The branch `feat/phase-1-cross-cutting` already exists; do NOT run `git checkout -b`. Just commit.

Expected: 214 vitest tests still pass. Email dispatch is exercised in Task 5's new test.

---

### Task 5: Email integration test

**Files:**
- Create: `tests/integration/services/notifications/emit-emails.test.ts`

The existing test infra wraps each test in a transaction (`tests/fixtures/db.ts withTransaction`). RESEND_API_KEY is unset in test env, so `sendEmail` returns `{ id: "dev-skipped" }` and the dispatcher returns `ok: true`. This is what we test.

We verify:
1. `emit()` for `work_request.submitted` inserts both in_app AND email rows in `notification_deliveries`, both with status `sent`.
2. `emit()` for an unregistered event type (`task.assigned`) inserts in_app row with status `sent`, AND email row with status `failed` and the "no template" errorMessage.
3. If a recipient has emailEnabled=false, only the in_app row is inserted.

- [ ] **Step 1: Implement**

```ts
import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { withTransaction } from "@/tests/fixtures/db";
import { emit } from "@/lib/services/notifications";

const TEST_ORG = "org_test_emails";
const TEST_USER = "usr_test_emails-1";

async function setupOrgAndUser(tx: Parameters<Parameters<typeof withTransaction>[0]>[0]) {
  await tx.insert(schema.organizations).values({
    id: TEST_ORG,
    name: "Test Emails Org",
    slug: "test-emails-org",
  });
  await tx.insert(schema.users).values({
    id: TEST_USER,
    name: "Recipient",
    email: "recipient@test.example.com",
    emailVerified: true,
    systemRole: "admin",
  });
}

describe("notifications.emit — email dispatch", () => {
  test("registered event creates both in_app and email deliveries", async () => {
    await withTransaction(async (tx) => {
      await setupOrgAndUser(tx);

      await emit(tx, {
        orgId: TEST_ORG,
        eventType: "work_request.submitted",
        recipientUserIds: [TEST_USER],
        payload: {
          workRequestId: "00000000-0000-0000-0000-000000000001",
          orgId: TEST_ORG,
          title: "Sample work request",
          actorId: TEST_USER,
        },
        relatedType: "work_request",
        relatedId: "00000000-0000-0000-0000-000000000001",
      });

      const notifs = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, TEST_USER));
      expect(notifs).toHaveLength(1);

      const deliveries = await tx
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, notifs[0]!.id));

      const channels = deliveries.map((d) => d.channel).sort();
      expect(channels).toEqual(["email", "in_app"]);
      expect(deliveries.every((d) => d.status === "sent")).toBe(true);
    });
  });

  test("unregistered event records email delivery as failed with template error", async () => {
    await withTransaction(async (tx) => {
      await setupOrgAndUser(tx);

      await emit(tx, {
        orgId: TEST_ORG,
        eventType: "task.assigned",
        recipientUserIds: [TEST_USER],
        payload: { taskId: "00000000-0000-0000-0000-000000000002", title: "Task" },
        relatedType: "task",
        relatedId: "00000000-0000-0000-0000-000000000002",
      });

      const [notif] = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, TEST_USER));
      expect(notif).toBeDefined();

      const deliveries = await tx
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, notif!.id));

      const inApp = deliveries.find((d) => d.channel === "in_app");
      const email = deliveries.find((d) => d.channel === "email");
      expect(inApp?.status).toBe("sent");
      expect(email?.status).toBe("failed");
      expect(email?.errorMessage).toContain("no template");
    });
  });

  test("emailEnabled=false skips email delivery", async () => {
    await withTransaction(async (tx) => {
      await setupOrgAndUser(tx);

      // Org default: email off for this event type.
      await tx.insert(schema.notificationPreferences).values({
        orgId: TEST_ORG,
        userId: null,
        eventType: "work_request.submitted",
        inAppEnabled: true,
        emailEnabled: false,
      });

      await emit(tx, {
        orgId: TEST_ORG,
        eventType: "work_request.submitted",
        recipientUserIds: [TEST_USER],
        payload: {
          workRequestId: "00000000-0000-0000-0000-000000000003",
          orgId: TEST_ORG,
          title: "Quiet request",
          actorId: TEST_USER,
        },
      });

      const [notif] = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, TEST_USER));
      expect(notif).toBeDefined();

      const deliveries = await tx
        .select()
        .from(schema.notificationDeliveries)
        .where(eq(schema.notificationDeliveries.notificationId, notif!.id));

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]!.channel).toBe("in_app");
    });
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm test
git add tests/integration/services/notifications/emit-emails.test.ts
git commit -m "test(notifications): emit dispatches email deliveries via Resend"
```

Expected: previous test count was 214 → now 217 (3 new tests).

---

### Task 6: Attachment download Server Action

**Files:**
- Modify: `lib/server-actions/attachments.ts` — add `getAttachmentDownloadUrlAction`
- Maybe Modify: `lib/services/attachments/index.ts` — add `getDownloadUrl` service helper if not present

The download path needs to:
1. Authorize the user can read the parent (re-uses `authorizeAttachmentParentRead`)
2. Verify the attachment exists, is `ready`, and belongs to the same org
3. Generate a presigned GET URL via `presignGet`

- [ ] **Step 1: Service helper**

In `lib/services/attachments/index.ts`, add:

```ts
export type GetDownloadUrlInput = { id: string };

export async function getDownloadUrl(
  db: AnyDb,
  ctx: OrgContext,
  input: GetDownloadUrlInput,
): Promise<Result<{ url: string; filename: string; contentType: string }>> {
  const [row] = await db
    .select()
    .from(schema.attachments)
    .where(eq(schema.attachments.id, input.id))
    .limit(1);
  if (!row) return err("not_found", "Attachment not found");
  if (row.orgId !== ctx.orgId) return err("not_found", "Attachment not found");
  if (row.status !== "ready") return err("not_found", "Attachment not ready");

  const auth = await authorizeAttachmentParentRead(db, ctx, row.parentType, row.parentId);
  if (!auth.ok) return auth;

  const url = await presignGet(row.r2Key, 900);
  return ok({ url, filename: row.filename, contentType: row.contentType });
}
```

Add `import { presignGet } from "@/lib/storage/r2-client";` near the existing `presignPut` import.

- [ ] **Step 2: Server-action wrapper**

In `lib/server-actions/attachments.ts`, append:

```ts
export async function getAttachmentDownloadUrlAction(input: { id: string }) {
  return withSessionContext((db, ctx) => attachments.getDownloadUrl(db, ctx, input));
}
```

The existing imports cover everything needed.

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
git add lib/services/attachments/index.ts lib/server-actions/attachments.ts
git commit -m "feat(attachments): getDownloadUrl service + server-action (presigned GET, 15min)"
```

Expected: 217 tests still pass.

---

### Task 7: AttachmentUpload + AttachmentList components

**Files:**
- Create: `components/app/attachment-upload.tsx` (`"use client"`)
- Create: `components/app/attachment-list.tsx` (server)

`AttachmentUpload` is a controlled file picker. On file selection it:
1. Calls `getUploadUrlAction({parentType, parentId, filename, contentType, sizeBytes})`
2. PUTs the file to the returned uploadUrl
3. Calls `confirmAttachmentAction({id})`
4. Calls `router.refresh()` so the parent page's `AttachmentList` rerenders

`AttachmentList` is a Server Component. For each attachment, it renders the filename + size + a presigned download link generated server-side via `getAttachmentDownloadUrlAction`.

- [ ] **Step 1: AttachmentUpload (client)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Paperclip } from "lucide-react";
import {
  getUploadUrlAction,
  confirmAttachmentAction,
} from "@/lib/server-actions/attachments";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
];
const MAX_BYTES = 50 * 1024 * 1024;

export function AttachmentUpload({
  parentType,
  parentId,
}: {
  parentType: "daily_update" | "work_request" | "task" | "comment";
  parentId: string;
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

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`File type "${file.type}" is not allowed.`);
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File exceeds the 50 MB limit.`);
      e.target.value = "";
      return;
    }

    startTransition(async () => {
      setProgress("Requesting upload URL…");
      const urlR = await getUploadUrlAction({
        parentType,
        parentId,
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
        const putRes = await fetch(urlR.data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!putRes.ok) {
          setError(`Upload failed: ${putRes.status} ${putRes.statusText}`);
          setProgress(null);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
        return;
      }

      setProgress("Confirming…");
      const confirmR = await confirmAttachmentAction({ id: urlR.data.attachmentId });
      if (!confirmR.ok) {
        setError(confirmR.error.message);
        setProgress(null);
        return;
      }

      setProgress(null);
      e.target.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`attachment-${parentType}-${parentId}`} className="flex items-center gap-2 text-sm">
        <Paperclip className="h-4 w-4" />
        Attach a file
      </Label>
      <Input
        id={`attachment-${parentType}-${parentId}`}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        disabled={pending}
        onChange={onChange}
      />
      {progress && <p className="text-xs text-slate-500">{progress}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 2: AttachmentList (server)**

```tsx
import Link from "next/link";
import { FileText } from "lucide-react";
import { listAttachmentsForParentAction, getAttachmentDownloadUrlAction } from "@/lib/server-actions/attachments";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export async function AttachmentList({
  parentType,
  parentId,
}: {
  parentType: "daily_update" | "work_request" | "task" | "comment";
  parentId: string;
}) {
  const r = await listAttachmentsForParentAction({ parentType, parentId });
  const attachments = r.ok ? r.data : [];

  if (attachments.length === 0) {
    return <p className="text-sm text-slate-500">No attachments.</p>;
  }

  // Resolve presigned URLs in parallel.
  const urls = await Promise.all(
    attachments.map((a) => getAttachmentDownloadUrlAction({ id: a.id })),
  );

  return (
    <ul className="space-y-2">
      {attachments.map((a, i) => {
        const urlResult = urls[i]!;
        const href = urlResult.ok ? urlResult.data.url : null;
        return (
          <li key={a.id} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
            <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {href ? (
              <Link href={href} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {a.filename}
              </Link>
            ) : (
              <span className="text-slate-500">{a.filename} (download unavailable)</span>
            )}
            <span className="ml-auto text-xs text-slate-400">{formatBytes(Number(a.sizeBytes))}</span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add components/app/attachment-upload.tsx components/app/attachment-list.tsx
git commit -m "feat(attachments): AttachmentUpload (client) + AttachmentList (server) components"
```

---

### Task 8: Attachment integration — work request flow

**Files:**
- Modify: `components/app/work-request-form.tsx` — show AttachmentUpload AFTER the request is submitted (render it on the success/redirect target). Easier: keep the form pre-submit; the post-submit page (work-request detail) renders both the AttachmentList AND a fresh AttachmentUpload widget for adding more files.
- Modify: `app/customer/requests/[requestId]/page.tsx` — render AttachmentList + AttachmentUpload (so the customer can attach files after submitting)
- Modify: `app/admin/orgs/[orgId]/work-requests/[requestId]/page.tsx` — render AttachmentList only (admins don't add attachments to customer requests)

We do NOT modify `work-request-form.tsx` — attaching to a not-yet-created work request is awkward (no parentId yet). The customer submits, lands on the detail page, and then attaches.

- [ ] **Step 1: Modify customer work-request detail page**

Read the current `app/customer/requests/[requestId]/page.tsx`, then add an "Attachments" section after the existing content. The existing page renders the request title, status, description, and any related task. Add:

```tsx
import { AttachmentList } from "@/components/app/attachment-list";
import { AttachmentUpload } from "@/components/app/attachment-upload";
import { Separator } from "@/components/ui/separator";

// ... inside the component, after the existing main content block:

<Separator />

<section className="space-y-3">
  <h2 className="text-lg font-medium">Attachments</h2>
  <AttachmentList parentType="work_request" parentId={requestId} />
  <AttachmentUpload parentType="work_request" parentId={requestId} />
</section>
```

The exact spot depends on the existing JSX. Place it as a sibling section after the existing detail content, separated by a `<Separator />`.

- [ ] **Step 2: Modify admin work-request detail page**

`app/admin/orgs/[orgId]/work-requests/[requestId]/page.tsx` — add a read-only AttachmentList. After the existing `Review` section:

```tsx
import { AttachmentList } from "@/components/app/attachment-list";

// ... after the <section><h2>Review</h2>...</section> block:

<Separator />

<section className="space-y-3">
  <h2 className="text-lg font-medium">Attachments</h2>
  <AttachmentList parentType="work_request" parentId={requestId} />
</section>
```

(`Separator` is already imported in this file.)

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add "app/customer/requests/[requestId]/page.tsx" "app/admin/orgs/[orgId]/work-requests/[requestId]/page.tsx"
git commit -m "feat(attachments): show + upload attachments on customer/admin work-request detail"
```

---

### Task 9: Attachment integration — daily update flow

**Files:**
- Modify: `app/customer/projects/[projectId]/updates/[updateId]/page.tsx` — add AttachmentList (read-only — customers don't post updates, so no upload widget)
- Modify: `app/employee/projects/[projectId]/updates/[updateId]/page.tsx` — add AttachmentList + AttachmentUpload

Same pattern as Task 8.

- [ ] **Step 1: Modify customer daily-update detail**

```tsx
import { AttachmentList } from "@/components/app/attachment-list";

// ... after the existing comment thread / existing content section, add:

<Separator />

<section className="space-y-3">
  <h2 className="text-lg font-medium">Attachments</h2>
  <AttachmentList parentType="daily_update" parentId={updateId} />
</section>
```

- [ ] **Step 2: Modify employee daily-update detail**

Same as customer plus the upload widget:

```tsx
import { AttachmentList } from "@/components/app/attachment-list";
import { AttachmentUpload } from "@/components/app/attachment-upload";

// ... add as a section:

<Separator />

<section className="space-y-3">
  <h2 className="text-lg font-medium">Attachments</h2>
  <AttachmentList parentType="daily_update" parentId={updateId} />
  <AttachmentUpload parentType="daily_update" parentId={updateId} />
</section>
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
pnpm lint
pnpm build
git add "app/customer/projects/[projectId]/updates/[updateId]/page.tsx" "app/employee/projects/[projectId]/updates/[updateId]/page.tsx"
git commit -m "feat(attachments): show attachments on daily-update detail (employee can upload)"
```

---

### Task 10: Playwright E2E (customer attaches a file to a work request)

**Files:**
- Create: `tests/e2e/customer-request-attachment.spec.ts`

The seed already creates the customer + project. The test signs in as customer, submits a work request, lands on the detail page, attaches a small text file via the AttachmentUpload widget, and verifies the file appears in the AttachmentList.

For E2E, R2 is not configured by default. The `r2-client.ts` `presignPut` will throw if R2_BUCKET is unset. We need to either:
- (a) Stub the R2 client in test env (complex)
- (b) Configure a real R2 bucket for E2E (requires credentials)
- (c) Add a test-only fallback that returns a fake URL + skips the real PUT

Decision: **the simplest approach is (c)**: add a `RUN_ATTACHMENT_E2E` env var. When unset, the AttachmentUpload's `getUploadUrlAction` will return a "not configured" error (because env.R2_BUCKET is unset) — AND the test SKIPS via `test.skip()` if the upload action fails with "R2 not configured".

This is pragmatic: in local dev with R2 wired the test runs end-to-end; in CI with R2 unset the test is skipped (not failed). Future: we can add a docker-based MinIO container for full E2E.

- [ ] **Step 1: Implement the test with skip-on-no-R2**

```ts
import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("customer attaches a file to a work request", async ({ page }) => {
  // Skip when R2 is not configured (no credentials in test env).
  test.skip(!process.env.R2_BUCKET, "R2_BUCKET not configured — skipping attachment E2E");

  await page.goto("/login");
  await page.fill("input#email", "customer@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/customer\/dashboard$/, { timeout: 15_000 });

  await page.click('a:has-text("New work request")');
  await page.fill("input#title", "Request with attachment");
  await page.fill("textarea#description", "See attached file");
  await page.click('button:has-text("Submit request")');

  // Lands on the detail page.
  await expect(page).toHaveURL(/\/customer\/requests\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText("Request with attachment")).toBeVisible();

  // Upload a small text file.
  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Hello from E2E", "utf-8"),
  });

  // The upload runs through getUploadUrl → R2 PUT → confirm. Expect the filename to appear in AttachmentList.
  await expect(page.getByText("evidence.txt")).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm test:e2e
```

Expected: 7 prior + 1 new = 8 tests. The new test is SKIPPED unless R2_BUCKET is set (so CI without R2 stays at 7 passing + 1 skipped).

```bash
git add tests/e2e/customer-request-attachment.spec.ts
git commit -m "test(e2e): customer attaches a file to a work request (skips without R2)"
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

Expected: 217 vitest + 7 Playwright (8 if R2 is configured).

- [ ] **Step 2: Hand off**

The branch `feat/phase-1-cross-cutting` is ready for merge into `main`.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-08-marketing-crm-phase-1-design.md`):

- §9.4 email notifications via Resend with React Email — Tasks 1-5 ✓
- §10 attachment upload + display via R2 presigned URLs — Tasks 6-9 ✓
- §10 attachment authorization mirrors parent visibility — Task 6 (getDownloadUrl re-uses authorizeAttachmentParentRead) ✓
- §10 attachments shown on work request + daily update detail pages — Tasks 8-9 ✓

**Out of scope (deliberately):**
- Email templates for `comment.posted`, `daily_update.posted`, `task.assigned`, `task.status_changed` — Phase 2. The dispatcher records these as `failed` with "no template" — non-fatal.
- Comment-thread attachments — Phase 2 (the schema supports it; the UI doesn't yet).
- Email digest / batching — every email is sent immediately. Phase 2 will add a daily/weekly digest mode.
- Push notifications — out of scope for Phase 1.
- Attachment delete — Phase 2 (admin-only via DB for now).
- Live polling for admin notifications — known limitation (Plan 3c noted), Phase 2.

**Placeholder scan:** None — every step has full code.

**Type consistency:**
- Email payload types are exported from each template file (e.g. `WorkRequestSubmittedPayload`).
- The dispatcher casts `rawPayload` to the expected payload type per registry entry — runtime payload is whatever the service emitted, so a type assertion is unavoidable here.
- `AttachmentUpload` and `AttachmentList` use the `attachmentParentTypeEnum` values via a string-literal union prop type.
- `getAttachmentDownloadUrlAction` accepts `{ id: string }` and returns `Result<{ url, filename, contentType }>`.

**Architectural decisions baked in:**
- Email failures don't break the originating action. The dispatcher catches render and send errors; the failure is recorded in `notification_deliveries.status = "failed"` with the `errorMessage`. The action that triggered the emit still succeeds.
- Email-only delivery (when in_app pref is off but email pref is on) still inserts a notification row — so the user has a history of being notified, even if the in-app bell doesn't show it. Plan 5 may add a "show all delivery history" admin view.
- Presigned download URLs are server-rendered into the page HTML. Pages with attachments are dynamic Server Components, so the URLs refresh on every render. Acceptable for Phase 1 (max 15-min stale URL on a long-tab session).
- `AttachmentUpload` does not show progress percent during the R2 PUT (only "Uploading…"). Phase 2 may add a progress bar via XHR.
- The R2 PUT is browser-direct (`fetch(presignedUrl, {method: 'PUT', ...})`). No bytes go through our server, which is the whole point of presigned URLs.
- E2E test skips gracefully when R2_BUCKET is unset, so this plan doesn't gate on E2E having R2 credentials wired.
