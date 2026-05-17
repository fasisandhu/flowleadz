'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

const links = [
  { label: 'How It Works', href: '#process' },
  { label: 'Services', href: '#services' },
  { label: 'Why FlowLeadz', href: '#why' },
  { label: 'Results', href: '#results' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock background scroll when mobile menu is open.
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <>
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          transition: 'all var(--d-base) var(--ease-out)',
          background: scrolled ? 'color-mix(in oklab, var(--bg) 82%, transparent)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(20px) saturate(180%)' : 'none',
          borderBottom: scrolled ? '1px solid var(--line-1)' : '1px solid transparent',
        }}
      >
        <div
          className="container"
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Logo />

          <div className="hide-md" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{
                  fontSize: 13.5,
                  color: 'var(--t-mid)',
                  transition: 'color var(--d-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t-hi)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t-mid)')}
              >
                {l.label}
              </a>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle />
            <a href="#book" className="btn btn-primary hide-md">
              Book a Call <ArrowRight size={14} />
            </a>
            <button
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen(!open)}
              className="icon-btn nav-mobile-trigger"
              style={{ display: 'none' }}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .nav-mobile-trigger { display: inline-flex !important; }
        }
      `}</style>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99,
            background: 'color-mix(in oklab, var(--bg) 96%, transparent)',
            backdropFilter: 'blur(24px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
            padding: 24,
          }}
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="display"
              style={{ fontSize: 28, fontWeight: 600, color: 'var(--t-hi)' }}
            >
              {l.label}
            </a>
          ))}
          <a
            href="#book"
            onClick={() => setOpen(false)}
            className="btn btn-primary btn-lg"
            style={{ marginTop: 16 }}
          >
            Book a Call <ArrowRight size={16} />
          </a>
        </div>
      )}
    </>
  );
}
