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
