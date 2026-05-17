import { ArrowRight, Zap } from 'lucide-react';
import Reveal from './Reveal';
import PipelineVisual from './PipelineVisual';

export default function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100svh',
        paddingTop: 'clamp(96px, 18vw, 140px)',
        paddingBottom: 'clamp(56px, 12vw, 100px)',
        overflow: 'hidden',
        background: 'var(--bg)',
      }}
    >
      <div
        className="dots-light"
        style={{ position: 'absolute', inset: 0, opacity: 0.6, pointerEvents: 'none' }}
      />

      <div
        style={{
          position: 'absolute',
          width: 720,
          height: 720,
          top: -240,
          left: -260,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,124,244,0.18), transparent 65%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 720,
          height: 720,
          bottom: -260,
          right: -240,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(123,92,240,0.16), transparent 65%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      <div className="container" style={{ position: 'relative' }}>
        <div
          className="hero-grid"
          style={{
            display: 'grid',
            gap: 64,
            alignItems: 'center',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
          }}
        >
          <div>
            <Reveal stagger>
              <div className="badge" style={{ marginBottom: 28 }}>
                <Zap size={12} color="var(--blue)" />
                Done-For-You Revenue Operations
              </div>

              <h1
                className="display"
                style={{
                  fontSize: 'clamp(40px, 6.6vw, 84px)',
                  fontWeight: 700,
                  lineHeight: 1.02,
                  letterSpacing: '-0.035em',
                  margin: '0 0 26px',
                  color: 'var(--ink)',
                }}
              >
                We Run Your<br />
                Entire Growth Operation.<br />
                <span className="gtext">You Run Your Business.</span>
              </h1>

              <p
                style={{
                  fontSize: 19,
                  lineHeight: 1.6,
                  color: 'var(--t-mid)',
                  maxWidth: 580,
                  margin: '0 0 38px',
                }}
              >
                FlowLeadz is the revenue partner behind serious business owners and contractors.
                We launch the Meta ads, build the automation, handle every follow-up, and compound
                your organic growth — until your revenue runs without you.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 44 }}>
                <a href="#book" className="btn btn-primary btn-lg">
                  Book Your Free Strategy Call
                  <ArrowRight size={16} />
                </a>
                <a href="#process" className="btn btn-ghost btn-lg">
                  See How It Works
                  <span style={{ color: 'var(--t-lo)' }}>↓</span>
                </a>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px' }}>
                {[
                  'Trusted by contractors & operators',
                  'Avg. client revenue lift: $40K–$180K/mo',
                  'Meta-certified · GHL-certified',
                ].map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      color: 'var(--t-mid)',
                    }}
                  >
                    <div
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--blue)',
                      }}
                    />
                    {t}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal>
            <PipelineVisual />
          </Reveal>
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
