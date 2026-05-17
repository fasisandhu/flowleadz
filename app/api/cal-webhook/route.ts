import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cal.com webhook receiver.
 *
 * Configure in Cal.com → Settings → Developer → Webhooks:
 *   URL:    https://<your-domain>/api/cal-webhook
 *   Secret: anything random — paste the same value into CAL_WEBHOOK_SECRET
 *   Events: BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED, MEETING_ENDED
 *   (Optional) Payload Template: see README — produces a flat predictable shape
 *
 * The handler accepts BOTH:
 *   - Cal.com's default nested payload (`{ triggerEvent, payload: {...} }`)
 *   - The custom flat template (everything at top level)
 * …so it works regardless of whether you've set up a Payload Template.
 */

const CAL_WEBHOOK_SECRET = process.env.CAL_WEBHOOK_SECRET;
const CAL_BOOKING_WEBHOOK_URL = process.env.CAL_BOOKING_WEBHOOK_URL;

type Person = { name?: string; email?: string; username?: string; timezone?: string; timeZone?: string };

type RawIncoming = {
  // Common
  triggerEvent?: string;
  createdAt?: string;

  // Flat (custom template) shape
  title?: string;
  type?: string;
  uid?: string;
  rescheduleUid?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  videoCallUrl?: string;
  cancellationReason?: string;
  rejectionReason?: string;
  organizer?: Person;
  attendee?: Person;
  attendees?: Person[];

  // Default (nested) shape
  payload?: {
    title?: string;
    type?: string;
    uid?: string;
    rescheduleUid?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    description?: string;
    cancellationReason?: string;
    rejectionReason?: string;
    organizer?: Person;
    attendees?: Person[];
    metadata?: { videoCallUrl?: string };
  };
};

type Booking = {
  triggerEvent: string;
  createdAt?: string;
  title?: string;
  type?: string;
  uid?: string;
  rescheduleUid?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  videoCallUrl?: string;
  cancellationReason?: string;
  rejectionReason?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  attendeeTimezone?: string;
};

function normalize(raw: RawIncoming): Booking {
  const p = raw.payload ?? {};
  const attendee = raw.attendee ?? raw.attendees?.[0] ?? p.attendees?.[0];
  const organizer = raw.organizer ?? p.organizer;

  return {
    triggerEvent: raw.triggerEvent ?? 'UNKNOWN',
    createdAt: raw.createdAt,
    title: raw.title ?? p.title,
    type: raw.type ?? p.type,
    uid: raw.uid ?? p.uid,
    rescheduleUid: raw.rescheduleUid ?? p.rescheduleUid,
    startTime: raw.startTime ?? p.startTime,
    endTime: raw.endTime ?? p.endTime,
    location: raw.location ?? p.location,
    description: raw.description ?? p.description,
    videoCallUrl: raw.videoCallUrl ?? p.metadata?.videoCallUrl,
    cancellationReason: raw.cancellationReason ?? p.cancellationReason,
    rejectionReason: raw.rejectionReason ?? p.rejectionReason,
    organizerName: organizer?.name,
    organizerEmail: organizer?.email,
    attendeeName: attendee?.name,
    attendeeEmail: attendee?.email,
    attendeeTimezone: attendee?.timeZone ?? attendee?.timezone,
  };
}

function verifySignature(body: string, signatureHeader: string | null): boolean {
  if (!CAL_WEBHOOK_SECRET) {
    console.warn('[Cal webhook] CAL_WEBHOOK_SECRET not set — accepting unsigned request');
    return true;
  }
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', CAL_WEBHOOK_SECRET).update(body).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHeader, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function pingChat(text: string) {
  if (!CAL_BOOKING_WEBHOOK_URL) return;
  try {
    await fetch(CAL_BOOKING_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[Cal webhook] chat ping failed', err);
  }
}

function fmtWhen(iso?: string) {
  if (!iso) return 'unknown time';
  try {
    return new Date(iso).toUTCString();
  } catch {
    return iso;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('x-cal-signature-256');

  // Verbose entry log so you can see every incoming hit, even before parsing.
  console.log('[Cal webhook] inbound POST', {
    bytes: raw.length,
    hasSignature: !!signature,
    hasSecret: !!CAL_WEBHOOK_SECRET,
  });

  if (!verifySignature(raw, signature)) {
    console.warn('[Cal webhook] invalid signature — rejecting (check CAL_WEBHOOK_SECRET matches Cal.com)');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let parsed: RawIncoming;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[Cal webhook] JSON parse failed', err, 'raw body:', raw.slice(0, 500));
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const b = normalize(parsed);
  const when = fmtWhen(b.startTime);

  console.log('[Cal webhook]', b.triggerEvent, {
    title: b.title,
    when,
    attendee: `${b.attendeeName ?? '?'} <${b.attendeeEmail ?? '?'}>`,
    organizer: `${b.organizerName ?? '?'} <${b.organizerEmail ?? '?'}>`,
    location: b.location,
    videoCallUrl: b.videoCallUrl,
    uid: b.uid,
  });

  switch (b.triggerEvent) {
    case 'BOOKING_CREATED':
      await pingChat(
        `🟢 *New strategy call booked* — ${b.attendeeName ?? '?'} <${b.attendeeEmail ?? '?'}> at ${when}` +
          (b.videoCallUrl ? `\n${b.videoCallUrl}` : '') +
          (b.description ? `\n> ${b.description.replace(/\n/g, ' ')}` : ''),
      );
      break;

    case 'BOOKING_RESCHEDULED':
      await pingChat(
        `🟡 *Strategy call rescheduled* — ${b.attendeeName ?? '?'} → ${when}` +
          (b.videoCallUrl ? `\n${b.videoCallUrl}` : ''),
      );
      break;

    case 'BOOKING_CANCELLED':
      await pingChat(
        `🔴 *Strategy call cancelled* — ${b.attendeeName ?? '?'} (was ${when})` +
          (b.cancellationReason ? `\nReason: ${b.cancellationReason}` : ''),
      );
      break;

    case 'MEETING_ENDED':
      // Hook for follow-up automation (post-call survey, CRM sync, etc.)
      break;

    default:
      console.log('[Cal webhook] unhandled triggerEvent', b.triggerEvent);
  }

  return NextResponse.json({ ok: true });
}

// Some tools (and Cal.com's "Test" sometimes) probe the URL with GET.
export async function GET() {
  return NextResponse.json({ ok: true, ready: true, hasSecret: !!CAL_WEBHOOK_SECRET });
}
