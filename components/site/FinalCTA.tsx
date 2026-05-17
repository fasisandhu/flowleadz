import { CheckCircle2, Clock } from 'lucide-react';
import Reveal from './Reveal';
import ContactForm from './ContactForm';

export default function FinalCTA() {
  return (
    <section
      id="book"
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
        style={{ position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none' }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 60% 50% at 50% 30%, rgba(123,92,240,0.20), transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 400,
          top: -100,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse, rgba(200,245,96,0.10), transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="container"
        style={{
          position: 'relative',
          display: 'grid',
          gap: 56,
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
          alignItems: 'center',
        }}
      >
        <Reveal stagger>
          <div
            className="badge badge-on-dark"
            style={{ marginBottom: 24 }}
          >
            <Clock size={11} color="var(--lime)" />
            Currently booking next month
          </div>

          <h2
            className="display"
            style={{
              fontSize: 'clamp(36px, 5.4vw, 64px)',
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: '-0.03em',
              margin: '0 0 24px',
              color: '#fff',
            }}
          >
            If You&apos;re Ready to Stop<br />
            Being the Bottleneck —<br />
            <span className="gtext">Let&apos;s Talk.</span>
          </h2>

          <p
            style={{
              fontSize: 18,
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.66)',
              maxWidth: 520,
              margin: '0 0 28px',
            }}
          >
            Book a 45-minute strategy call with a senior partner. We&apos;ll look at your business,
            your numbers, and your bottlenecks — and tell you straight whether we can help. If we
            can, we&apos;ll show you exactly what the next 90 days could look like.
          </p>

          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 12,
            }}
          >
            {[
              '45 min with a senior partner — not a sales rep',
              'Custom 90-day revenue plan you can keep',
              'No pitch, no pressure — straight talk',
              'Onboarding only 2 new partners per month',
            ].map((t, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.78)',
                }}
              >
                <CheckCircle2 size={16} color="var(--lime)" />
                {t}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal>
          <ContactForm />
        </Reveal>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          #book .container { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
