'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

/**
 * Site-scoped wrapper around next-themes. Uses the CRM's class-based theme
 * system (toggles `.dark` on <html>) so the site and CRM stay in sync — flip
 * the theme on the site and the CRM picks it up on next navigation.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch: don't render the icon until the client knows
  // which theme is active.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="icon-btn" aria-hidden="true" style={{ visibility: 'hidden' }} />;
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
