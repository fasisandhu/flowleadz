'use client';

import { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, MessageSquare, Sparkles, Target } from 'lucide-react';

const stages = [
  { label: 'Lead Captured', sub: 'Form fill received', Icon: Target, color: '#3B7CF4' },
  { label: 'Instant SMS Sent', sub: 'Personalized • 3.2s', Icon: MessageSquare, color: '#22D3EE' },
  { label: 'Appointment Booked', sub: 'Calendar confirmed', Icon: Calendar, color: '#7B5CF0' },
  { label: 'Deal Closed', sub: 'Pipeline updated', Icon: CheckCircle2, color: '#3B7CF4' },
];

export default function PipelineVisual() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((p) => (p + 1) % stages.length), 1900);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          inset: -40,
          background:
            'radial-gradient(ellipse at center, rgba(123,92,240,0.16), transparent 60%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          background: 'var(--surface)',
          border: '1px solid var(--line-1)',
          borderRadius: 24,
          padding: 'clamp(18px, 4vw, 26px)',
          boxShadow: 'var(--shadow-3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 50% 0%, rgba(59,124,244,0.06), transparent 55%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative' }}>
          {/* window chrome */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 16,
              marginBottom: 20,
              borderBottom: '1px solid var(--line-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#FF5F57', '#FEBC2E', '#28C840'].map((c, i) => (
                  <div
                    key={i}
                    style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }}
                  />
                ))}
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--t-lo)' }}>
                flowleadz.system
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#28C840',
                  position: 'relative',
                  color: '#28C840',
                }}
              >
                <div className="pulse-ring" />
              </div>
              <span
                className="mono"
                style={{ fontSize: 10, color: 'var(--t-lo)', letterSpacing: '0.1em' }}
              >
                LIVE
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stages.map((stage, i) => {
              const { Icon } = stage;
              const isActive = i === active;
              const isPast = i < active;
              return (
                <div key={i} style={{ position: 'relative' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: 14,
                      borderRadius: 14,
                      border: `1px solid ${isActive ? stage.color + '40' : 'var(--line-1)'}`,
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(59,124,244,0.08), rgba(123,92,240,0.08))'
                        : 'var(--surface-2)',
                      transition: 'all var(--d-slow) var(--ease-out)',
                      boxShadow: isActive ? `0 12px 30px -12px ${stage.color}40` : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isActive
                          ? `linear-gradient(135deg, ${stage.color}, ${stage.color}90)`
                          : 'var(--surface)',
                        border: `1px solid ${isActive ? stage.color : 'var(--line-2)'}`,
                        transform: isActive ? 'scale(1.05)' : 'scale(1)',
                        transition: 'all var(--d-slow) var(--ease-out)',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} color={isActive ? '#fff' : 'var(--t-mid)'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--ink)',
                        }}
                      >
                        {stage.label}
                      </div>
                      <div
                        className="mono"
                        style={{ fontSize: 10, color: 'var(--t-lo)', marginTop: 2 }}
                      >
                        {isActive ? stage.sub : isPast ? 'Completed' : 'Queued'}
                      </div>
                    </div>
                    {isActive && (
                      <div
                        style={{
                          position: 'relative',
                          width: 8,
                          height: 8,
                          color: stage.color,
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '50%',
                            background: stage.color,
                          }}
                        />
                        <div className="pulse-ring" style={{ borderRadius: '50%' }} />
                      </div>
                    )}
                    {isPast && <CheckCircle2 size={14} color="#28C840" />}
                  </div>
                  {i < stages.length - 1 && (
                    <div style={{ marginLeft: 20, padding: '2px 0' }}>
                      <div
                        style={{
                          width: 1,
                          height: 12,
                          background: 'linear-gradient(180deg, var(--line-2), transparent)',
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: '1px solid var(--line-1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--t-lo)',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                Avg. Response
              </div>
              <div
                className="display"
                style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}
              >
                &lt; 5 min
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--t-lo)',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                Today
              </div>
              <div
                className="display gtext"
                style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}
              >
                +47 leads
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="floaty"
        style={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 72,
          height: 72,
          borderRadius: 18,
          background: 'var(--lime)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 18px 30px -10px rgba(200,245,96,0.55)',
        }}
      >
        <Sparkles size={26} color="var(--lime-ink)" />
      </div>
    </div>
  );
}
