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
