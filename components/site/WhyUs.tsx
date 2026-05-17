import { CheckCircle2 } from 'lucide-react';
import Section, { Headline } from './Section';
import Reveal from './Reveal';

const rows = [
  { label: 'Engagement', traditional: 'Pay monthly, hope for results', us: 'Strategic partnership, accountable to revenue' },
  { label: 'Scope', traditional: 'Run ads, send reports', us: 'Ads + automation + CRM + organic + ops' },
  { label: 'Owner Effort', traditional: '5–10 hrs/week managing them', us: '1 strategy call every 2 weeks. That’s it.' },
  { label: 'Reporting', traditional: 'Impressions, clicks, CTR', us: 'Revenue, pipeline, cost-per-booked-job' },
  { label: 'Back-Office', traditional: 'Not their problem', us: 'Built and maintained for you' },
  { label: 'Organic Growth', traditional: 'Sold separately (or not at all)', us: 'Layered in once paid is profitable' },
  { label: 'Time to Profit', traditional: '90+ days, if at all', us: 'Cash-flow positive in month 1' },
];

export default function WhyUs() {
  return (
    <Section id="why" ghostNumber="07">
      <Reveal>
        <Headline max="900px">
          Why Operators<br />
          <span style={{ color: 'var(--t-lo)', fontWeight: 400 }}>
            Choose Us Over a &ldquo;Marketing Agency&rdquo;
          </span>
        </Headline>
      </Reveal>

      <Reveal>
        <div style={{ marginTop: 48, maxWidth: 920, margin: '48px auto 0' }}>
          <div className="cmp">
            <div className="cmp-row head">
              <div className="cmp-cell" />
              <div className="cmp-cell">
                <div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 9,
                      color: 'var(--t-lo)',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Standard
                  </div>
                  <div
                    className="display"
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--t-lo)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Traditional Agency
                  </div>
                </div>
              </div>
              <div className="cmp-cell" style={{ background: 'linear-gradient(135deg, rgba(59,124,244,0.06), rgba(123,92,240,0.06))' }}>
                <div>
                  <div
                    className="mono"
                    style={{
                      fontSize: 9,
                      color: 'var(--blue)',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Our Approach
                  </div>
                  <div
                    className="display gtext"
                    style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}
                  >
                    FlowLeadz
                  </div>
                </div>
              </div>
            </div>

            {rows.map((r, i) => (
              <div key={i} className="cmp-row">
                <div className="cmp-cell label-cell">{r.label}</div>
                <div className="cmp-cell bad">{r.traditional}</div>
                <div className="cmp-cell good">
                  <CheckCircle2 size={14} color="var(--blue)" style={{ flexShrink: 0 }} />
                  {r.us}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 56, textAlign: 'center' }}>
            <p
              className="display"
              style={{
                fontSize: 'clamp(22px, 3vw, 32px)',
                fontWeight: 600,
                lineHeight: 1.25,
                color: 'var(--t-hi)',
                maxWidth: 720,
                margin: '0 auto',
                letterSpacing: '-0.02em',
              }}
            >
              You don&apos;t need another marketing agency.<br />
              <span className="gtext">You need a growth partner who actually owns the outcome.</span>
            </p>
            <p style={{ fontSize: 15, color: 'var(--t-lo)', marginTop: 16 }}>
              That&apos;s the difference. That&apos;s all we do.
            </p>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
