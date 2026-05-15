export function EmptyTasksIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="18" y="14" width="56" height="72" rx="6" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <line x1="28" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="2" />
      <line x1="28" y1="44" x2="64" y2="44" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <line x1="28" y1="56" x2="50" y2="56" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <line x1="28" y1="68" x2="60" y2="68" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <circle cx="22" cy="32" r="2.5" fill="currentColor" />
      <circle cx="22" cy="44" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="22" cy="56" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="22" cy="68" r="2.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
