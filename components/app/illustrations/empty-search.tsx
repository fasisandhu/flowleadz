export function EmptySearchIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <circle cx="42" cy="42" r="22" stroke="currentColor" strokeWidth="2" opacity="0.4" />
      <path d="M58 58l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
