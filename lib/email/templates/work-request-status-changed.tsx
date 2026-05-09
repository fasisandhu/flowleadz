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
