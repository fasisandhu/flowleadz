'use client';

import { ArrowRight, BarChart3, Bell, Calendar, Infinity as InfinityIcon, MessageSquare, Phone } from 'lucide-react';
import Reveal, { useReveal } from './Reveal';

const timeline = [
  { step: '01', label: 'Lead Hits Your System', desc: 'Meta ad click, form fill, missed call, or DM — every channel feeds one inbox.', time: '0 sec' },
  { step: '02', label: 'Instant Qualified Reply', desc: 'Personalized SMS sent from your number. Sounds like you. Filters tire-kickers.', time: 'immediate' },
  { step: '03', label: 'Multi-Channel Nurture Fires', desc: 'Email + SMS + voicemail drops trigger in sequence based on how they engage.', time: 'immediate' },
  { step: '04', label: 'Quote / Estimate Follow-Up', desc: 'Quote sent? System tracks it. Auto-nudges them at 24h, 72h, and 7 days.', time: '24 hr' },
  { step: '05', label: 'Calendar-Synced Booking', desc: "They self-book directly into your or your sales rep's calendar — confirmed, with reminders.", time: 'when ready' },
  { step: '06', label: 'Job Won → Review Request', desc: 'Job closes? Auto-sends a Google review request at the perfect moment. Reputation compounds.', time: 'on close' },
  { step: '07', label: 'Pipeline Reports to You', desc: 'Weekly revenue, pipeline value, and ad performance — straight to your inbox. No dashboards to check.', time: 'continuous' },
];

const features = [
  { Icon: Phone, title: 'Missed Call → Auto Text-Back', desc: "On a job site? Phone in your pocket? Every missed call gets a text back in seconds — recovered, not lost." },
  { Icon: Calendar, title: 'Self-Service Calendar Booking', desc: 'Qualified leads book themselves into your calendar. No phone tag. No scheduling assistant required.' },
  { Icon: MessageSquare, title: 'Quote & Estimate Follow-Up', desc: 'Sent a quote? The system follows up at 24h, 72h, and 7 days — until they sign or formally pass.' },
  { Icon: BarChart3, title: 'Owner-Level Reporting', desc: 'Weekly revenue, pipeline value, and ad ROI — delivered to your inbox. The numbers that actually matter.' },
  { Icon: Bell, title: 'Hot Lead Alerts to Your Team', desc: 'When a high-intent lead engages, your sales rep gets pinged on Slack/SMS the moment it happens.' },
  { Icon: InfinityIcon, title: 'Long-Term Nurture for the Slow Burns', desc: "Not every lead buys this month. Our 6-month nurture brings them back when they're ready — without you remembering." },
];

function TimelineItem({ item, index }: { item: typeof timeline[0]; index: number }) {
  const [ref, visible] = useReveal(0.4);
  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        paddingLeft: 80,
        paddingBottom: 24,
        opacity: visible ? 1 : 0.3,
        filter: visible ? 'blur(0)' : 'blur(2px)',
        transform: visible ? 'translateX(0)' : 'translateX(-12px)',
        transition: 'all var(--d-slow) var(--ease-out)',
        transitionDelay: `${index * 60}ms`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'linear-gradient(135deg, #3B7CF4, #7B5CF0)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: visible
            ? '0 12px 32px -10px rgba(59,124,244,0.5), 0 0 0 4px rgba(59,124,244,0.10)'
            : '0 0 0 0 transparent',
          transition: 'box-shadow var(--d-slow) var(--ease-out)',
        }}
      >
        <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
          {item.step}
        </span>
      </div>
      <div className="card" style={{ padding: 22, borderRadius: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 6,
          }}
        >
          <h3
            className="display"
            style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}
          >
            {item.label}
          </h3>
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#3B7CF4',
              background: 'rgba(59,124,244,0.10)',
              padding: '4px 8px',
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            {item.time}
          </div>
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--t-mid)', margin: 0 }}>
          {item.desc}
        </p>
      </div>
    </div>
  );
}

export default function Automation() {
  return (
    <section
      style={{
        position: 'relative',
        padding: 'var(--section-py) var(--container-px)',
        background: 'var(--callout-bg)',
        color: 'var(--callout-fg)',
        overflow: 'hidden',
      }}
    >
      <div
        className="dots-dark"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />

      <div className="container" style={{ position: 'relative' }}>
        <div
          className="ghost ghost-dark display"
          style={{ fontSize: 'clamp(180px, 24vw, 360px)', top: -40, right: -20 }}
        >
          03
        </div>

        <Reveal>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 64px' }}>
            <div
              className="mono"
              style={{
                fontSize: 10,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: 'var(--lime)',
                marginBottom: 20,
                fontWeight: 500,
              }}
            >
              Complete Business Automation
            </div>
            <h2
              className="display"
              style={{
                fontSize: 'clamp(36px, 5.2vw, 64px)',
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: '-0.025em',
                margin: '0 0 24px',
                color: '#fff',
              }}
            >
              The Last Time You&apos;ll<br />
              <span className="gtext">Manually Chase a Lead.</span>
            </h2>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.65,
                color: 'rgba(255,255,255,0.66)',
                margin: 0,
              }}
            >
              We architect a complete back-office that handles every lead, every quote follow-up,
              every reminder, and every pipeline update — without you or your team lifting a finger.
              Built on GoHighLevel. Customized to your business. Maintained by us.
            </p>
          </div>
        </Reveal>

        <div style={{ maxWidth: 720, margin: '0 auto 80px', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              left: 27,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'linear-gradient(180deg, #3B7CF4, #7B5CF0, transparent)',
              opacity: 0.5,
            }}
          />
          {timeline.map((item, i) => (
            <TimelineItem key={i} item={item} index={i} />
          ))}
        </div>

        <Reveal stagger>
          <div
            style={{
              display: 'grid',
              gap: 16,
              marginBottom: 48,
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            }}
          >
            {features.map((f, i) => {
              const { Icon } = f;
              return (
                <div key={i} className="card-dark" style={{ padding: 24 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 11,
                      background:
                        'linear-gradient(135deg, rgba(59,124,244,0.18), rgba(123,92,240,0.12))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <Icon size={18} color="var(--lime)" />
                  </div>
                  <h3
                    className="display"
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      margin: '0 0 8px',
                      letterSpacing: '-0.01em',
                      color: '#fff',
                    }}
                  >
                    {f.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      color: 'rgba(255,255,255,0.62)',
                      margin: 0,
                    }}
                  >
                    {f.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </Reveal>

        <Reveal>
          <div style={{ textAlign: 'center' }}>
            <a
              href="#book"
              className="btn btn-lime btn-lg"
              style={{ display: 'inline-flex' }}
            >
              See What This Looks Like for Your Business
              <ArrowRight size={16} />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
