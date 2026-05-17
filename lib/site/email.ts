import { Resend } from 'resend';

export type Lead = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  revenue?: string;
  message?: string;
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const LEAD_TO_EMAIL = process.env.LEAD_TO_EMAIL;
const LEAD_FROM_EMAIL = process.env.LEAD_FROM_EMAIL ?? 'FlowLeadz <onboarding@resend.dev>';
const LEAD_WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL;

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInternalEmail(lead: Lead) {
  const rows: Array<[string, string | undefined]> = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Company', lead.company],
    ['Revenue', lead.revenue],
  ];

  const tableRows = rows
    .filter(([, v]) => !!v)
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:10px 14px;background:#0E0E1A;color:#9aa0b4;font-family:monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;border-bottom:1px solid #1f1f33;width:140px;vertical-align:top;">${k}</td>
          <td style="padding:10px 14px;background:#15152A;color:#F0F0F8;font-family:Inter,sans-serif;font-size:14px;border-bottom:1px solid #1f1f33;">${escapeHtml(v ?? '')}</td>
        </tr>`,
    )
    .join('');

  const messageBlock = lead.message
    ? `
      <div style="margin-top:20px;padding:18px 20px;background:#15152A;border:1px solid #1f1f33;border-radius:14px;">
        <div style="font-family:monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#9aa0b4;margin-bottom:8px;">Bottleneck</div>
        <div style="font-family:Inter,sans-serif;font-size:14px;line-height:1.6;color:#F0F0F8;white-space:pre-wrap;">${escapeHtml(lead.message)}</div>
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0E0E1A;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td>
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:24px;letter-spacing:-0.025em;color:#fff;margin-bottom:4px;">
            New FlowLeadz strategy-call request
          </div>
          <div style="font-family:monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7B5CF0;margin-bottom:24px;">
            Inbound · ${new Date().toUTCString()}
          </div>
          <table role="presentation" width="100%" style="border-collapse:collapse;border-radius:14px;overflow:hidden;border:1px solid #1f1f33;">
            ${tableRows}
          </table>
          ${messageBlock}
          <p style="margin-top:24px;font-size:12px;color:#6b7088;font-family:Inter,sans-serif;">
            Reply directly to this email to reach the prospect — their address is in the From field.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

function renderAutoreplyEmail(lead: Lead) {
  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:32px 16px;background:#FAFAF7;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;border-collapse:collapse;">
      <tr>
        <td>
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;letter-spacing:-0.025em;color:#0E0E1A;margin-bottom:8px;">
            Got it, ${escapeHtml(lead.name.split(' ')[0] ?? lead.name)}.
          </div>
          <p style="font-size:15px;line-height:1.6;color:#0E0E1A;">
            Thanks for reaching out to FlowLeadz. A senior partner will personally review your details
            and reach out within one business day to book your strategy call.
          </p>
          <p style="font-size:15px;line-height:1.6;color:#0E0E1A;">
            In the meantime, if anything urgent comes up, reply directly to this email and it will
            land in our inbox.
          </p>
          <div style="margin-top:24px;padding:18px 20px;background:#fff;border:1px solid rgba(14,14,26,0.08);border-radius:14px;">
            <div style="font-family:monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#3B7CF4;margin-bottom:8px;">What happens next</div>
            <ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#0E0E1A;">
              <li>We review your business, numbers, and bottlenecks before the call.</li>
              <li>We schedule a 45-minute strategy call (no pitch).</li>
              <li>You walk away with a 90-day plan you can keep — even if we don't work together.</li>
            </ol>
          </div>
          <p style="margin-top:32px;font-size:13px;color:#7A7A92;">— The FlowLeadz team</p>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();
}

export async function deliverLead(lead: Lead): Promise<{ ok: boolean; details: string[] }> {
  const details: string[] = [];

  // 1. Always log to the server console as a baseline. Useful as a fallback.
  console.log('[FlowLeadz lead]', JSON.stringify(lead));

  // 2. Optional: forward to webhook (Slack/Discord/Teams).
  if (LEAD_WEBHOOK_URL) {
    try {
      const text =
        `*New FlowLeadz lead* — ${lead.name} <${lead.email}>` +
        (lead.company ? ` · ${lead.company}` : '') +
        (lead.revenue ? ` · ${lead.revenue}` : '') +
        (lead.message ? `\n> ${lead.message.replace(/\n/g, ' ')}` : '');
      await fetch(LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      details.push('webhook:ok');
    } catch (err) {
      details.push(`webhook:fail(${(err as Error).message})`);
    }
  }

  // 3. Resend email — primary lead delivery.
  // If Resend isn't configured yet, that's not a failure — the lead is still
  // captured in the server log (and any other configured channels). The
  // operator can wire up Resend later.
  if (!resend || !LEAD_TO_EMAIL) {
    details.push('email:skipped(no-config)');
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[FlowLeadz] RESEND_API_KEY/LEAD_TO_EMAIL not set — lead captured in log only.',
      );
    }
    return { ok: true, details };
  }

  try {
    const internal = await resend.emails.send({
      from: LEAD_FROM_EMAIL,
      to: [LEAD_TO_EMAIL],
      replyTo: lead.email,
      subject: `New strategy-call request — ${lead.name}${lead.company ? ` · ${lead.company}` : ''}`,
      html: renderInternalEmail(lead),
    });
    if (internal.error) throw new Error(internal.error.message);
    details.push('email:internal-ok');

    const autoreply = await resend.emails.send({
      from: LEAD_FROM_EMAIL,
      to: [lead.email],
      subject: 'We got your request — FlowLeadz',
      html: renderAutoreplyEmail(lead),
    });
    if (autoreply.error) {
      // Non-fatal — internal already went out.
      details.push(`email:autoreply-fail(${autoreply.error.message})`);
    } else {
      details.push('email:autoreply-ok');
    }
    return { ok: true, details };
  } catch (err) {
    details.push(`email:fail(${(err as Error).message})`);
    return { ok: details.includes('webhook:ok'), details };
  }
}
