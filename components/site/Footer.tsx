import { ArrowRight } from 'lucide-react';
import Logo from './Logo';

// Brand icons inlined — lucide-react v1 dropped them due to trademark concerns.
function Linkedin({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}
function Instagram({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}
function Facebook({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h4
        className="mono"
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--ink)',
          marginBottom: 18,
        }}
      >
        {title}
      </h4>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
        }}
      >
        {links.map((link, i) => (
          <li key={i}>
            <a
              href="#"
              style={{
                fontSize: 13.5,
                color: 'var(--t-mid)',
                transition: 'color var(--d-fast) var(--ease-out)',
              }}
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--line-1)',
        padding: '72px 24px',
        background: 'var(--bg)',
        position: 'relative',
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gap: 40,
            marginBottom: 56,
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}
        >
          <div>
            <div style={{ marginBottom: 16 }}>
              <Logo />
            </div>
            <p
              style={{
                fontSize: 13.5,
                color: 'var(--t-mid)',
                lineHeight: 1.6,
                marginBottom: 20,
                maxWidth: 240,
              }}
            >
              Your Revenue, On Autopilot.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {[Linkedin, Instagram, Facebook].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: '1px solid var(--line-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--surface)',
                  }}
                >
                  <Icon size={15} color="var(--t-mid)" />
                </a>
              ))}
            </div>
          </div>

          <FooterCol
            title="What We Do"
            links={['Meta Ads', 'Business Automation', 'Organic Growth', 'Strategy Partnership']}
          />
          <FooterCol
            title="Company"
            links={['How It Works', 'Why FlowLeadz', 'Results', 'Book a Call']}
          />
          <div>
            <h4
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                marginBottom: 18,
              }}
            >
              Customers
            </h4>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 11,
              }}
            >
              <li>
                <a
                  href="/login"
                  style={{ fontSize: 13.5, color: 'var(--t-mid)' }}
                >
                  Customer sign in
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--ink)',
                marginBottom: 18,
              }}
            >
              Contact
            </h4>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <li>
                <a
                  href="mailto:hello@flowleadz.com"
                  style={{ fontSize: 13.5, color: 'var(--t-mid)' }}
                >
                  hello@flowleadz.com
                </a>
              </li>
              <li style={{ marginTop: 8 }}>
                <a href="#book" className="btn btn-primary">
                  Book a Call <ArrowRight size={14} />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div
          style={{
            paddingTop: 32,
            borderTop: '1px solid var(--line-1)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            fontSize: 12,
            color: 'var(--t-lo)',
          }}
        >
          <div>© {new Date().getFullYear()} FlowLeadz. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 24 }}>
            <a href="#" style={{ color: 'var(--t-lo)' }}>Privacy Policy</a>
            <a href="#" style={{ color: 'var(--t-lo)' }}>Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
