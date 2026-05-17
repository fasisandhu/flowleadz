import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-slate-950">
      {/* Ambient gradient blobs — FlowLeadz brand */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-1/4 top-0 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-indigo-200/40 via-violet-200/30 to-transparent blur-3xl dark:from-indigo-500/15 dark:via-violet-500/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-gradient-to-tl from-cyan-200/30 via-indigo-200/20 to-transparent blur-3xl dark:from-cyan-500/10 dark:via-indigo-500/10"
      />

      <header className="relative z-10 mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
        <Link href="/" className="inline-flex items-center gap-2" aria-label="FlowLeadz home">
          <Image src="/logo-mark.png" alt="" width={24} height={24} priority />
          <span
            className="text-sm font-semibold text-slate-900 dark:text-slate-50"
            style={{ letterSpacing: "-0.02em" }}
          >
            flow
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
              leadz
            </span>
          </span>
        </Link>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
