import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { LayoutDashboard, FolderKanban, CheckSquare, Clock } from "lucide-react";
import { auth } from "@/lib/better-auth/config";
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { NotificationsBell } from "@/components/app/notifications-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MobileNavSheet, type MobileNavLink } from "@/components/app/mobile-nav-sheet";
import { SearchInput } from "@/components/app/search-input";
import { RealtimeProvider } from "@/components/app/realtime-provider";
import { RealtimeRefresh } from "@/components/app/realtime-refresh";

const EMPLOYEE_NAV: MobileNavLink[] = [
  { href: "/employee/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/employee/projects", label: "Projects", icon: "projects" },
  { href: "/employee/tasks", label: "My tasks", icon: "tasks" },
  { href: "/employee/time", label: "Time", icon: "time" },
];

async function signOutAction() {
  "use server";
  const { redirect } = await import("next/navigation");
  const { headers } = await import("next/headers");
  const { auth } = await import("@/lib/better-auth/config");
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const notifs = await listNotificationsAction({ filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-5">
            <MobileNavSheet links={EMPLOYEE_NAV} />
            <Link href="/employee/dashboard" className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
              Marketing CRM
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-0.5 text-sm md:flex">
              <Link href="/employee/dashboard" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </Link>
              <Link href="/employee/projects" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                <FolderKanban className="h-3.5 w-3.5" />
                Projects
              </Link>
              <Link href="/employee/tasks" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                <CheckSquare className="h-3.5 w-3.5" />
                My tasks
              </Link>
              <Link href="/employee/time" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                <Clock className="h-3.5 w-3.5" />
                Time
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <SearchInput searchHref="/employee/search" />
            <ThemeToggle />
            <NotificationsBell initialUnreadCount={initialUnread} href="/employee/notifications" />
            <span className="mx-1 hidden h-4 w-px bg-slate-200 dark:bg-slate-700 md:inline-block" aria-hidden="true" />
            <Link
              href="/employee/settings/profile"
              className="hidden max-w-[140px] truncate rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50 md:inline-block"
            >
              {session.user.name ?? session.user.email}
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <RealtimeProvider>
        <RealtimeRefresh />
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </RealtimeProvider>
    </div>
  );
}
