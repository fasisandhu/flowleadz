import { CheckCircle2 } from 'lucide-react';
import Section, { Headline, Label } from './Section';
import Reveal from './Reveal';

const steps = [
  {
    num: '01',
    title: 'Strategy & Diagnosis',
    desc: "We sit down with you and look at the actual numbers. Where revenue is coming from, where it's leaking, what offers convert, and where the bottleneck really is. No fluff — just a hard look at the business.",
    deliverable: 'Custom Growth Plan + Revenue Forecast',
  },
  {
    num: '02',
    title: 'Build the Operation',
    desc: 'We build your entire growth stack — Meta campaigns, landing pages, full GHL automation, CRM, pipeline, every follow-up sequence, team workflows. Done in 2–3 weeks, not 2–3 months.',
    deliverable: 'Live System, Trained Team, First Ads Running',
  },
  {
    num: '03',
    title: 'Launch Paid & Drive Revenue',
    desc: "Ads go live. Leads come in. Automation handles the heavy lifting. Within the first 30 days, you should see real, measurable revenue from the system — not just 'engagement.'",
    deliverable: 'Cash-Flow Positive in Month 1',
  },
  {
    num: '04',
    title: 'Compound the Growth',
    desc: 'Once paid is profitable, we layer organic on top: content, reviews, referrals. Your cost per lead drops every month. After 6–12 months, organic carries the load while paid scales the wins.',
    deliverable: 'Self-Sustaining Growth Engine',
  },
];

export default function Process() {
  return (
    <Section id="process" ghostNumber="05">
      <Reveal>
        <Label>How We Engage</Label>
        <Headline>
          From Bottleneck to<br />
          <span className="gtext">Compounding Growth.</span>
        </Headline>
      </Reveal>

      <Reveal stagger>
        <div
          style={{
            marginTop: 56,
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          {steps.map((step, i) => (
            <div
              key={i}
              className="card"
              style={{ padding: '32px 28px', position: 'relative', overflow: 'hidden' }}
            >
              <div
                className="display"
                style={{
                  position: 'absolute',
                  top: -32,
                  right: -8,
                  fontSize: 160,
                  fontWeight: 700,
                  lineHeight: 0.85,
                  color: 'var(--t-mute)',
                  opacity: 0.06,
                  pointerEvents: 'none',
                  userSelect: 'none',
                  letterSpacing: '-0.05em',
                }}
              >
                {step.num}
              </div>

              <div style={{ position: 'relative' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      color: 'var(--blue)',
                      letterSpacing: '0.2em',
                    }}
                  >
                    STEP
                  </span>
                  <span
                    className="display gtext"
                    style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}
                  >
                    {step.num}
                  </span>
                </div>
                <h3
                  className="display"
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    margin: '0 0 14px',
                    color: 'var(--ink)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    color: 'var(--t-mid)',
                    margin: '0 0 24px',
                  }}
                >
                  {step.desc}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    paddingTop: 18,
                    borderTop: '1px solid var(--line-1)',
                  }}
                >
                  <CheckCircle2 size={16} color="var(--blue)" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: 13 }}>
                    <span
                      className="mono"
                      style={{
                        color: 'var(--t-lo)',
                        fontSize: 10,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        marginRight: 8,
                      }}
                    >
                      Deliverable:
                    </span>
                    <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
                      {step.deliverable}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
