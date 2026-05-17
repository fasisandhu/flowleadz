import { BarChart3, Cpu, Megaphone, Rocket } from 'lucide-react';
import Section, { Headline, Label } from './Section';
import Reveal from './Reveal';

const services = [
  {
    Icon: Rocket,
    title: 'Meta Ads — Run by Operators, Not Interns',
    desc: "We run your Meta ads end-to-end: offer, creative, copy, targeting, and daily optimization. No 'ad managers' learning on your dime — actual operators who've spent millions and know what converts in your industry.",
    impact: 'Predictable, qualified leads from day one. Cost-per-booked-job that drops month over month.',
  },
  {
    Icon: Cpu,
    title: 'Complete Business Automation',
    desc: 'We build your entire back office on GoHighLevel: CRM, pipeline, every follow-up sequence, every reminder, every reporting workflow. Your business runs itself. You and your team focus on closing and delivering.',
    impact: 'Owners get 20–40 hours a week back. Nothing falls through the cracks. Ever.',
    featured: true,
  },
  {
    Icon: Megaphone,
    title: 'Organic Growth Engine',
    desc: 'Once paid is dialled in, we build the organic side: content that compounds, a Google review machine, social authority, and referral systems. The goal — your cost per lead drops every quarter while volume keeps climbing.',
    impact: 'Free leads that compound monthly. Eventually, organic outpaces paid.',
  },
  {
    Icon: BarChart3,
    title: 'Strategic Operations Partner',
    desc: "Bi-weekly strategy calls with a senior partner. We review numbers, troubleshoot bottlenecks, plan offers, and make the calls that move the business forward. You're not buying services — you're hiring a growth team.",
    impact: 'A real growth partner in your corner. Not a vendor. Not a slack channel. A partner.',
  },
];

export default function Services() {
  return (
    <Section id="services" ghostNumber="04" tone="cream">
      <Reveal>
        <Label>What You&apos;re Actually Hiring</Label>
        <Headline>
          Four Pillars.<br />
          <span className="gtext">One Complete Operation.</span>
        </Headline>
      </Reveal>

      <Reveal stagger>
        <div
          style={{
            marginTop: 56,
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {services.map((s, i) => {
            const { Icon } = s;
            return (
              <div
                key={i}
                className="card"
                style={{
                  padding: 28,
                  position: 'relative',
                  background: s.featured
                    ? 'linear-gradient(135deg, rgba(59,124,244,0.06), rgba(123,92,240,0.06))'
                    : undefined,
                  border: s.featured ? '1px solid rgba(123,92,240,0.30)' : undefined,
                }}
              >
                {s.featured && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -10,
                      left: 28,
                      padding: '5px 12px',
                      background: 'linear-gradient(135deg, var(--blue), var(--purple))',
                      borderRadius: 999,
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 9,
                      fontWeight: 500,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: '#fff',
                    }}
                  >
                    Our Edge
                  </div>
                )}
                <div
                  style={{
                    width: s.featured ? 54 : 46,
                    height: s.featured ? 54 : 46,
                    borderRadius: 12,
                    background: s.featured
                      ? 'linear-gradient(135deg, var(--blue), var(--purple))'
                      : 'linear-gradient(135deg, rgba(59,124,244,0.18), rgba(123,92,240,0.10))',
                    border: '1px solid var(--line-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 20,
                  }}
                >
                  <Icon size={s.featured ? 22 : 18} color={s.featured ? '#fff' : 'var(--blue)'} />
                </div>
                <h3
                  className="display"
                  style={{
                    fontSize: s.featured ? 22 : 19,
                    fontWeight: 700,
                    margin: '0 0 12px',
                    color: 'var(--ink)',
                    letterSpacing: '-0.015em',
                  }}
                >
                  {s.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: 'var(--t-mid)',
                    margin: '0 0 24px',
                  }}
                >
                  {s.desc}
                </p>
                <div style={{ paddingTop: 18, borderTop: '1px solid var(--line-1)' }}>
                  <div
                    className="mono"
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--blue)',
                      marginBottom: 6,
                    }}
                  >
                    Revenue Impact
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: 'var(--ink)',
                      lineHeight: 1.45,
                    }}
                  >
                    {s.impact}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>
    </Section>
  );
}
