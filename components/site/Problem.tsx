import { Clock, GitBranch, Phone, Snowflake } from 'lucide-react';
import Section, { Headline, Label, Sub } from './Section';
import Reveal from './Reveal';

const pains = [
  {
    Icon: Phone,
    title: "You're Drowning in the Day-to-Day",
    desc: "You're running jobs, managing crews, and quoting clients. There's no time left to run ads, chase leads, or build follow-up systems — but without them, growth stalls.",
  },
  {
    Icon: Clock,
    title: 'Leads Go Cold Before You Reply',
    desc: "By the time you're off-site and checking your phone, three competitors have already called them back. A lead unanswered for an hour is a deal already lost.",
  },
  {
    Icon: Snowflake,
    title: 'Marketing Spend with Nothing to Show',
    desc: "You've tried agencies. They ran ads, sent reports full of impressions, and your bank account got smaller. No system, no pipeline, no real revenue.",
  },
  {
    Icon: GitBranch,
    title: "You Can't Scale What You Can't See",
    desc: "If every quote, every follow-up, every closed job lives in your head — there's a hard ceiling on how big you can grow. Operators scale. Technicians stay stuck.",
  },
];

export default function Problem() {
  return (
    <Section id="problem" ghostNumber="01" tone="cream">
      <Reveal>
        <Label>Where Most Operators Get Stuck</Label>
        <Headline>
          You Built the Business.<br />
          <span className="gtext">Now It Owns You.</span>
        </Headline>
        <Sub>
          Most contractors and operators we meet are doing $50K–$300K a month and could be doing
          double — but they&apos;re the bottleneck. The work, the quotes, the follow-ups, the marketing —
          all of it lives on their shoulders.
        </Sub>
      </Reveal>

      <Reveal stagger>
        <div
          style={{
            display: 'grid',
            gap: 16,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {pains.map((p, i) => {
            const { Icon } = p;
            return (
              <div key={i} className="card" style={{ padding: 28 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 12,
                    background:
                      'linear-gradient(135deg, rgba(59,124,244,0.10), rgba(123,92,240,0.10))',
                    border: '1px solid var(--line-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 18,
                  }}
                >
                  <Icon size={18} color="var(--blue)" />
                </div>
                <h3
                  className="display"
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    margin: '0 0 10px',
                    color: 'var(--ink)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {p.title}
                </h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--t-mid)', margin: 0 }}>
                  {p.desc}
                </p>
              </div>
            );
          })}
        </div>
      </Reveal>

      <Reveal>
        <div style={{ marginTop: 80, textAlign: 'center', position: 'relative' }}>
          <div
            style={{
              maxWidth: 200,
              margin: '0 auto 56px',
              height: 1,
              background:
                'linear-gradient(90deg, transparent, var(--blue) 50%, transparent)',
              opacity: 0.6,
            }}
          />
          <p
            className="display"
            style={{
              fontSize: 'clamp(22px, 3vw, 32px)',
              fontWeight: 600,
              lineHeight: 1.25,
              color: 'var(--ink)',
              maxWidth: 760,
              margin: '0 auto',
              letterSpacing: '-0.015em',
            }}
          >
            You don&apos;t need another vendor.<br />
            <span style={{ color: 'var(--t-lo)' }}>
              You need someone to take the whole growth operation off your plate.
            </span>
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
