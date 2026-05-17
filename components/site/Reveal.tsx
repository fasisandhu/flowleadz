'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref as RefObject<T>, visible] as const;
}

type RevealProps = {
  children: React.ReactNode;
  stagger?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function Reveal({
  children,
  stagger = false,
  className = '',
  style,
}: RevealProps) {
  const [ref, visible] = useReveal<HTMLDivElement>();
  const cls = `${stagger ? 'reveal-stagger' : 'reveal'} ${visible ? 'visible' : ''} ${className}`.trim();
  return (
    <div ref={ref} className={cls} style={style}>
      {children}
    </div>
  );
}
