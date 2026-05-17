import { NextResponse } from 'next/server';
import { deliverLead, type Lead } from '@/lib/site/email';
import { backupLead } from '@/lib/site/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Basic in-memory rate limit (per-IP) — fine for low-volume marketing site.
// On serverless, this resets between cold starts; that's acceptable for spam triage.
const HITS = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function rateLimit(ip: string) {
  const now = Date.now();
  const record = HITS.get(ip);
  if (!record || record.reset < now) {
    HITS.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_PER_WINDOW) return false;
  record.count++;
  return true;
}

function getIp(req: Request) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: Request) {
  const ip = getIp(req);

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 },
    );
  }

  let body: Partial<Lead> & { website?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  // Honeypot — silently drop bots that fill the hidden field.
  if (body.website && body.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim();

  if (!name || name.length < 2) {
    return NextResponse.json({ error: 'Please share your name.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'That email looks invalid.' }, { status: 400 });
  }

  const lead: Lead = {
    name: name.slice(0, 120),
    email: email.slice(0, 200),
    phone: (body.phone ?? '').trim().slice(0, 40) || undefined,
    company: (body.company ?? '').trim().slice(0, 160) || undefined,
    revenue: (body.revenue ?? '').trim().slice(0, 80) || undefined,
    message: (body.message ?? '').trim().slice(0, 5000) || undefined,
  };

  // Run email delivery and the durable backup (Airtable/Sheets) in parallel.
  // Email is the primary, user-facing delivery; backup is a permanent record.
  // Backup failure is non-fatal — we still confirm to the user as long as email
  // (or the server log fallback) succeeded.
  const [emailResult, backupResult] = await Promise.all([
    deliverLead(lead),
    backupLead(lead),
  ]);

  if (!emailResult.ok) {
    return NextResponse.json(
      {
        error:
          "We couldn't deliver that just now. Please email hello@flowleadz.com directly and we'll respond fast.",
        details:
          process.env.NODE_ENV === 'development'
            ? { email: emailResult.details, backup: backupResult.details }
            : undefined,
      },
      { status: 502 },
    );
  }

  if (!backupResult.ok) {
    console.warn('[FlowLeadz] lead delivered via email but backup failed', backupResult.details);
  }

  return NextResponse.json({ ok: true });
}
