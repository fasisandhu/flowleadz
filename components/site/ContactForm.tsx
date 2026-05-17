'use client';

import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import CalEmbed from './CalEmbed';

type Status = 'idle' | 'sending' | 'success' | 'error';

const CAL_USERNAME = process.env.NEXT_PUBLIC_CAL_USERNAME ?? '';
const CAL_EVENT = process.env.NEXT_PUBLIC_CAL_EVENT_SLUG ?? '';

export default function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ name: string; email: string; message: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get('name') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
      phone: String(data.get('phone') ?? '').trim(),
      company: String(data.get('company') ?? '').trim(),
      revenue: String(data.get('revenue') ?? '').trim(),
      message: String(data.get('message') ?? '').trim(),
      // honeypot — bots fill this; humans don't see it
      website: String(data.get('website') ?? ''),
    };

    if (!payload.name || !payload.email) {
      setError('Please share your name and email so we can reach you.');
      setStatus('error');
      return;
    }

    setStatus('sending');
    setError(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
      setSubmitted({
        name: payload.name,
        email: payload.email,
        message: [payload.company, payload.revenue, payload.message].filter(Boolean).join(' · '),
      });
      setStatus('success');
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'success' && submitted) {
    const calConfigured = CAL_USERNAME && CAL_EVENT;
    return (
      <div
        className="card-dark"
        style={{
          padding: calConfigured ? 24 : '48px 32px',
          textAlign: calConfigured ? 'left' : 'center',
          borderRadius: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: calConfigured ? 18 : 20,
            justifyContent: calConfigured ? 'flex-start' : 'center',
            flexDirection: calConfigured ? 'row' : 'column',
          }}
        >
          <div
            style={{
              width: calConfigured ? 44 : 64,
              height: calConfigured ? 44 : 64,
              borderRadius: calConfigured ? 12 : 18,
              background: 'var(--lime)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={calConfigured ? 22 : 28} color="var(--lime-ink)" />
          </div>
          <div>
            <h3
              className="display"
              style={{
                fontSize: calConfigured ? 22 : 26,
                fontWeight: 700,
                color: '#fff',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              {calConfigured
                ? `Got it, ${submitted.name.split(' ')[0]}. Pick a time.`
                : "You're in. We'll be in touch."}
            </h3>
            {!calConfigured && (
              <p
                style={{
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.66)',
                  maxWidth: 440,
                  margin: '10px auto 0',
                }}
              >
                A senior partner will review your details and reach out within one business day to
                book your strategy call. Watch your inbox (and the spam folder, just in case).
              </p>
            )}
          </div>
        </div>

        {calConfigured && (
          <>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.66)', margin: '0 0 16px' }}>
              We&apos;ve emailed you a confirmation. Lock in your 45-minute strategy call below —
              calendar invite lands in your inbox automatically.
            </p>
            <CalEmbed
              username={CAL_USERNAME}
              event={CAL_EVENT}
              prefill={{ name: submitted.name, email: submitted.email, notes: submitted.message }}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="field-dark"
      style={{
        background: 'var(--callout-2)',
        border: '1px solid var(--callout-line)',
        borderRadius: 24,
        padding: 'clamp(20px, 4vw, 28px)',
        display: 'grid',
        gap: 16,
        boxShadow: '0 30px 80px -30px rgba(0,0,0,0.6)',
      }}
    >
      {/* honeypot, hidden visually & from accessibility */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: 1,
          height: 1,
          opacity: 0,
        }}
      />

      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <div className="field">
          <label htmlFor="cf-name">Your Name</label>
          <input id="cf-name" name="name" required placeholder="Jane Smith" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="cf-email">Email</label>
          <input
            id="cf-email"
            name="email"
            type="email"
            required
            placeholder="you@business.com"
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label htmlFor="cf-phone">Phone (optional)</label>
          <input
            id="cf-phone"
            name="phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            autoComplete="tel"
          />
        </div>
        <div className="field">
          <label htmlFor="cf-company">Business / Company</label>
          <input
            id="cf-company"
            name="company"
            placeholder="Acme Roofing"
            autoComplete="organization"
          />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="cf-revenue">Current Monthly Revenue</label>
          <select id="cf-revenue" name="revenue" defaultValue="">
            <option value="" disabled>
              Select a range…
            </option>
            <option>Under $25K / month</option>
            <option>$25K–$50K / month</option>
            <option>$50K–$150K / month</option>
            <option>$150K–$500K / month</option>
            <option>$500K+ / month</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="cf-message">What&apos;s the bottleneck?</label>
          <textarea
            id="cf-message"
            name="message"
            placeholder="Tell us what's stuck — leads, follow-up, capacity, hiring, anything."
          />
        </div>
      </div>

      {status === 'error' && error && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(255,90,90,0.08)',
            border: '1px solid rgba(255,90,90,0.30)',
            color: '#ffb4b4',
            fontSize: 13.5,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginTop: 4,
        }}
      >
        <p
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.44)',
            margin: 0,
            maxWidth: 360,
          }}
        >
          We respond within one business day. No pitch, no pressure — just a real
          conversation.
        </p>
        <button
          type="submit"
          className="btn btn-lime btn-lg"
          disabled={status === 'sending'}
          style={{ opacity: status === 'sending' ? 0.7 : 1, cursor: status === 'sending' ? 'progress' : 'pointer' }}
        >
          {status === 'sending' ? 'Sending…' : 'Book My Strategy Call'}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
