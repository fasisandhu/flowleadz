import { Megaphone, Target, TrendingUp, Workflow } from 'lucide-react';
import Section, { Headline, Label } from './Section';
import Reveal from './Reveal';

const stages = [
  {
    label: 'PAID',
    items: ['Meta Ads (Primary)', 'Offer Engineering', 'Creative + Targeting'],
    Icon: Megaphone,
    color: '#3B7CF4',
    sub: 'Cash flow from day one',
  },
  {
    label: 'CONVERT',
    items: ['Landing Pages', 'Lead Qualification', '5-Min Response System'],
    Icon: Target,
    color: '#22D3EE',
    sub: 'Turn clicks into booked jobs',
  },
  {
    label: 'OPERATE',
    items: ['Full CRM Build', 'Pipeline Automation', 'Team Workflows'],
    Icon: Workflow,
    color: '#7B5CF0',
    sub: 'Your business runs itself',
  },
  {
    label: 'COMPOUND',
    items: ['Organic Content', 'Reputation Engine', 'Referral Systems'],
    Icon: TrendingUp,
    color: '#3B7CF4',
    sub: 'Free leads, forever',
  },
];

export default function Solution() {
  return (
    <Section ghostNumber="02">
      <Reveal>
        <Label>How We Operate</Label>
        <Headline>
          We&apos;re Not an Agency.<br />
          <span className="gtext">We&apos;re Your Growth Department.</span>
        </Headline>
      </Reveal>

      <Reveal stagger>
        <div
          style={{
            marginTop: 56,
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          {stages.map((stage, i) => {
            const { Icon } = stage;
            return (
              <div key={i} className="card" style={{ padding: 26 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${stage.color}28, ${stage.color}12)`,
                    border: `1px solid ${stage.color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 18,
                  }}
                >
                  <Icon size={18} color={stage.color} />
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: 'var(--t-lo)',
                    letterSpacing: '0.18em',
                    marginBottom: 6,
                  }}
                >
                  PHASE {String(i + 1).padStart(2, '0')}
                </div>
                <h3
                  className="display"
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    margin: '0 0 6px',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {stage.label}
                </h3>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--t-lo)',
                    marginBottom: 14,
                    fontStyle: 'italic',
                  }}
                >
                  {stage.sub}
                </div>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {stage.items.map((item, j) => (
                    <li
                      key={j}
                      style={{
                        fontSize: 13.5,
                        color: 'var(--t-mid)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: stage.color,
                        }}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Reveal>

      <Reveal>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.65,
            color: 'var(--t-mid)',
            maxWidth: 820,
            margin: '64px 0 64px',
          }}
        >
          We start with Meta ads to put cash in your account fast — typically within the first
          30 days. Then we build out the back-end automation, CRM, and team workflows. Once paid is
          dialled in, we layer organic content, reputation, and referral systems on top so your
          cost per lead drops every quarter while revenue keeps climbing.
        </p>
      </Reveal>

      <Reveal>
        <div style={{ position: 'relative', maxWidth: 920, margin: '0 auto' }}>
          <div
            style={{
              position: 'absolute',
              inset: -2,
              background: 'linear-gradient(135deg, var(--blue), var(--purple))',
              borderRadius: 28,
              opacity: 0.16,
              filter: 'blur(24px)',
            }}
          />
          <div
            className="card"
            style={{
              position: 'relative',
              borderRadius: 28,
              padding: '56px 40px',
              textAlign: 'center',
            }}
          >
            <div
              className="display gtext"
              style={{ fontSize: 56, fontWeight: 700, lineHeight: 0.7, marginBottom: 20 }}
            >
              &ldquo;
            </div>
            <p
              className="display"
              style={{
                fontSize: 'clamp(22px, 2.8vw, 32px)',
                fontWeight: 600,
                lineHeight: 1.25,
                color: 'var(--ink)',
                maxWidth: 740,
                margin: '0 auto',
                letterSpacing: '-0.02em',
              }}
            >
              Most agencies sell you tactics. We give you back{' '}
              <span className="gtext">40 hours a week</span> — and a business that grows whether
              you show up or not.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
