import Image from 'next/image';

type Props = { invert?: boolean; size?: number };

export default function Logo({ invert = false, size = 28 }: Props) {
  return (
    <a
      href="/"
      aria-label="FlowLeadz home"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
    >
      <Image
        src="/logo-mark.png"
        alt=""
        width={size}
        height={size}
        priority
        style={{ display: 'block' }}
      />
      <span
        className="display"
        style={{
          fontWeight: 700,
          fontSize: 20,
          letterSpacing: '-0.02em',
          color: invert ? '#fff' : 'var(--ink)',
        }}
      >
        flow<span className="gtext">leadz</span>
      </span>
    </a>
  );
}
