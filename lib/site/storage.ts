import crypto from 'node:crypto';
import type { Lead } from './email';

/* ==========================================================================
   Lead backup — appends every submission to Airtable and/or Google Sheets,
   so you have a permanent record outside email. Both targets are independent
   and optional: configure whichever (or both) you want via env vars.
   ========================================================================== */

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE ?? 'Leads!A:H';
const GOOGLE_SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_SA_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

/* ----------------------------- Airtable --------------------------------- */

async function appendToAirtable(lead: Lead): Promise<string> {
  if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
    return 'airtable:skipped';
  }
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_TABLE_NAME,
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          'Submitted At': new Date().toISOString(),
          Name: lead.name,
          Email: lead.email,
          Phone: lead.phone ?? '',
          Company: lead.company ?? '',
          Revenue: lead.revenue ?? '',
          Message: lead.message ?? '',
        },
        typecast: true,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${text}`.slice(0, 240));
    }
    return 'airtable:ok';
  } catch (err) {
    return `airtable:fail(${(err as Error).message})`;
  }
}

/* --------------------------- Google Sheets ------------------------------ */
/* Hand-rolled service-account JWT auth so we don't need a heavy SDK.       */

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getGoogleAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const signingInput = `${header}.${claim}`;
  // env vars typically store newlines as literal "\n" — rehydrate them
  const key = privateKey.replace(/\\n/g, '\n');
  const signature = base64url(
    crypto.createSign('RSA-SHA256').update(signingInput).sign(key),
  );
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`token exchange ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('no access_token in token response');
  return json.access_token;
}

async function appendToGoogleSheet(lead: Lead): Promise<string> {
  if (!GOOGLE_SHEET_ID || !GOOGLE_SA_EMAIL || !GOOGLE_SA_KEY) {
    return 'sheets:skipped';
  }
  try {
    const token = await getGoogleAccessToken(GOOGLE_SA_EMAIL, GOOGLE_SA_KEY);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}` +
      `/values/${encodeURIComponent(GOOGLE_SHEET_RANGE)}` +
      `:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const row = [
      new Date().toISOString(),
      lead.name,
      lead.email,
      lead.phone ?? '',
      lead.company ?? '',
      lead.revenue ?? '',
      lead.message ?? '',
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${text}`.slice(0, 240));
    }
    return 'sheets:ok';
  } catch (err) {
    return `sheets:fail(${(err as Error).message})`;
  }
}

/* ------------------------------ public ---------------------------------- */

export async function backupLead(lead: Lead): Promise<{ ok: boolean; details: string[] }> {
  const results = await Promise.all([appendToAirtable(lead), appendToGoogleSheet(lead)]);
  const succeeded = results.some((r) => r.endsWith(':ok'));
  const attempted = results.some((r) => !r.endsWith(':skipped'));
  // ok = at least one target succeeded, or no target was configured (skipped is fine)
  const ok = !attempted || succeeded;
  if (!ok) console.warn('[FlowLeadz backup] all targets failed', results);
  return { ok, details: results };
}
