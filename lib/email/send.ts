import { Resend } from "resend";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

let cachedResend: Resend | null = null;

function resend(): Resend {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  if (cachedResend) return cachedResend;
  cachedResend = new Resend(env.RESEND_API_KEY);
  return cachedResend;
}

export async function sendEmail(input: { to: string; subject: string; html: string; text?: string }) {
  if (!env.RESEND_FROM_EMAIL) throw new Error("RESEND_FROM_EMAIL not configured");
  if (!env.RESEND_API_KEY) {
    log.warn({ to: input.to, subject: input.subject }, "Resend not configured — email skipped");
    return { id: "dev-skipped" };
  }
  const result = await resend().emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (result.error) throw new Error(`Resend send failed: ${result.error.message}`);
  return { id: result.data?.id ?? "" };
}
