export default function ForgotPage() {
  return (
    <div className="rounded border bg-white p-6 text-sm dark:border-slate-700 dark:bg-slate-900">
      Password reset is handled via a magic link in Phase 1 — request one at <a href="/magic-link" className="underline">/magic-link</a>.
    </div>
  );
}
