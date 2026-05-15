import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { LayoutDashboard, FolderKanban, CheckSquare, Clock } from "lucide-react";
import { auth } from "@/lib/better-auth/config";
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { NotificationsBell } from "@/components/app/notifications-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/employee/dashboard" className="font-semibold">
              Marketing CRM
            </Link>
            <nav aria-label="Main" className="flex items-center gap-4 text-sm">
              <Link href="/employee/dashboard" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link href="/employee/projects" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50">
                <FolderKanban className="h-4 w-4" />
                Projects
              </Link>
              <Link href="/employee/tasks" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50">
                <CheckSquare className="h-4 w-4" />
                My tasks
              </Link>
              <Link href="/employee/time" className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50">
                <Clock className="h-4 w-4" />
                Time
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationsBell initialUnreadCount={initialUnread} href="/employee/notifications" />
            <span className="text-sm text-slate-600 dark:text-slate-300">{session.user.name ?? session.user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-sm text-slate-600 hover:underline dark:text-slate-300">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
