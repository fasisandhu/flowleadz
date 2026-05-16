import * as React from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative flex items-start justify-between gap-4 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-indigo-50 via-white to-white p-5 shadow-sm dark:border-slate-800 dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 dark:shadow-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-500/10"
      />
      <div className="relative min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
        )}
      </div>
      {action && <div className="relative flex-shrink-0">{action}</div>}
    </div>
  );
}
