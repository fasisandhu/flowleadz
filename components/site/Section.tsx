import type { CSSProperties, ReactNode } from 'react';

type Props = {
  id?: string;
  children: ReactNode;
  ghostNumber?: string;
  tone?: 'light' | 'dark' | 'cream';
  style?: CSSProperties;
};

const TONE_BG: Record<NonNullable<Props['tone']>, string> = {
  light: 'var(--bg)',
  cream: 'var(--surface-2)',
  dark: 'var(--callout-bg)',
};

export default function Section({ id, children, ghostNumber, tone = 'light', style }: Props) {
  const isDark = tone === 'dark';
  return (
    <section
      id={id}
      style={{
        position: 'relative',
        padding: 'var(--section-py) var(--container-px)',
        background: TONE_BG[tone],
        color: isDark ? 'var(--callout-fg)' : 'var(--t-hi)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div className="container" style={{ position: 'relative' }}>
        {ghostNumber && (
          <div
            className={`ghost display ${isDark ? 'ghost-dark' : ''}`}
            style={{ fontSize: 'clamp(180px, 24vw, 360px)', top: -40, right: -20 }}
          >
            {ghostNumber}
          </div>
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </div>
    </section>
  );
}

export function Headline({
  children,
  max = '900px',
  invert,
}: {
  children: ReactNode;
  max?: string;
  invert?: boolean;
}) {
  return (
    <h2
      className="display"
      style={{
        fontSize: 'clamp(36px, 5.2vw, 64px)',
        fontWeight: 700,
        lineHeight: 1.04,
        letterSpacing: '-0.025em',
        color: invert ? '#fff' : 'var(--t-hi)',
        maxWidth: max,
        margin: '0 0 24px',
      }}
    >
      {children}
    </h2>
  );
}

export function Sub({
  children,
  max = '640px',
  invert,
}: {
  children: ReactNode;
  max?: string;
  invert?: boolean;
}) {
  return (
    <p
      style={{
        fontSize: 18,
        lineHeight: 1.65,
        color: invert ? 'rgba(255,255,255,0.72)' : 'var(--t-mid)',
        maxWidth: max,
        margin: '0 0 56px',
      }}
    >
      {children}
    </p>
  );
}

export function Label({
  children,
  onDark,
}: {
  children: ReactNode;
  onDark?: boolean;
}) {
  return (
    <div className={`label ${onDark ? 'label-on-dark' : ''}`}>
      <span className="label-line" />
      {children}
    </div>
  );
}
