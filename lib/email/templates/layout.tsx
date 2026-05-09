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
