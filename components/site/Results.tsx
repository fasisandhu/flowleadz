'use client';

import { useEffect, useState } from 'react';
import Section, { Headline, Label } from './Section';
import Reveal, { useReveal } from './Reveal';

const metrics = [
  { value: '$84', suffix: 'K', label: 'Avg. monthly revenue lift per client' },
  { value: '4.7', suffix: '×', label: 'Average return on ad spend (Meta)' },
  { value: '30', suffix: ' days', label: 'To first profitable month, on average' },
  { value: '20', suffix: '+ hrs', label: "Owner's time recovered every week" },
  { value: '$8.2', suffix: 'M+', label: 'Client revenue generated (last 12 mo)' },
];

const cases = [
  {
    industry: 'Roofing Contractor',
    location: 'Houston, TX',
    challenge: 'Doing $90K/mo, owner working 70-hour weeks, no system in place',
    solution: 'Meta ads + complete GHL automation + sales rep workflow + review engine',
    result: 'Hit $230K/mo in 5 months. Owner now works 35 hrs/week. Hired second sales rep.',
    stat: '+$140K',
  },
  {
    industry: 'Med Spa',
    location: 'Phoenix, AZ',
    challenge: 'Booked solid but losing 40% of inbound calls during treatments',
    solution: 'Missed-call text-back + auto-booking + nurture for no-shows + organic content layer',
    result: 'Recovered 92% of missed calls. Monthly revenue up $62K. Now running 3 locations.',
    stat: '+$62K/mo',
  },
  {
    industry: 'HVAC & Plumbing',
    location: 'Tampa, FL',
    challenge: '$50K/mo on ads with no clear ROI, leads going stale, no follow-up',
    solution: 'Meta rebuild + 5-min response automation + quote follow-up system + KPI dashboards',
    result: 'Cost-per-booked-job down 41%. Hit $410K month within 7 months. Sold the business in year 2.',
    stat: '4.7× ROAS',
  },
];

function Metric({ m }: { m: typeof metrics[0] }) {
  const [ref, visible] = useReveal(0.3);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const target = parseFloat(m.value.replace(/[^0-9.]/g, '')) || 0;
    const start = Date.now();
    const duration = 1600;
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setCount(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, m.value]);

  const formatValue = () => {
    const target = parseFloat(m.value.replace(/[^0-9.]/g, '')) || 0;
    const prefix = m.value.match(/^[<+$]/)?.[0] || '';
    const hasDecimal = m.value.includes('.');
    if (!visible) return m.value;
    const display = hasDecimal ? count.toFixed(1) : Math.round(count).toString();
    return `${prefix}${display}` + (target === 0 ? '' : '');
  };

  return (
    <div
      ref={ref}
      className="card"
      style={{ padding: 24, textAlign: 'center', borderRadius: 16 }}
    >
      <div
        className="display"
        style={{
          fontSize: 'clamp(32px, 4vw, 44px)',
          fontWeight: 700,
          marginBottom: 6,
          letterSpacing: '-0.025em',
          lineHeight: 1,
        }}
      >
        <span className="gtext">{formatValue()}</span>
        <span style={{ color: 'var(--t-mid)' }}>{m.suffix}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--t-lo)', lineHeight: 1.4 }}>{m.label}</div>
    </div>
  );
}

export default function Results() {
  return (
    <Section id="results" ghostNumber="06" tone="cream">
      <Reveal>
        <Label>The Numbers Behind the Work</Label>
        <Headline>
          Real Operators.<br />
          <span className="gtext">Real Revenue.</span>
        </Headline>
      </Reveal>

      <Reveal stagger>
        <div
          style={{
            marginTop: 56,
            marginBottom: 64,
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          {metrics.map((m, i) => (
            <Metric key={i} m={m} />
          ))}
        </div>
      </Reveal>

      <Reveal stagger>
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          }}
        >
          {cases.map((c, i) => (
            <div key={i} className="card" style={{ padding: 28 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div>
                  <div
                    className="display"
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: 'var(--ink)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {c.industry}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--t-lo)', marginTop: 4 }}>
                    {c.location}
                  </div>
                </div>
                <div
                  className="display gtext"
                  style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}
                >
                  {c.stat}
                </div>
              </div>

              {[
                { label: 'Challenge', value: c.challenge },
                { label: 'Solution', value: c.solution },
              ].map((row, j) => (
                <div key={j} style={{ marginBottom: 14 }}>
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
                    {row.label}
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--t-mid)', lineHeight: 1.5 }}>
                    {row.value}
                  </div>
                </div>
              ))}

              <div
                style={{
                  paddingTop: 16,
                  borderTop: '1px solid var(--line-1)',
                  marginTop: 4,
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 9,
                    color: 'var(--blue)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Result
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: 'var(--ink)',
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}
                >
                  {c.result}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
