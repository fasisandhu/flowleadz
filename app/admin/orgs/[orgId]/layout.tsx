import { notFound } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, FolderKanban, Inbox } from "lucide-react";
import { auth } from "@/lib/better-auth/config";
import { headers } from "next/headers";
import { adminListOrgsAction } from "@/lib/server-actions/admin/orgs";
import { adminListNotificationsAction } from "@/lib/server-actions/admin/notifications";
import { NotificationsBell } from "@/components/app/notifications-bell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MobileNavSheet, type MobileNavLink } from "@/components/app/mobile-nav-sheet";
import { SearchInput } from "@/components/app/search-input";
import { RealtimeProvider } from "@/components/app/realtime-provider";
import { RealtimeRefresh } from "@/components/app/realtime-refresh";

async function signOutAction() {
  "use server";
  const { redirect } = await import("next/navigation");
  const { headers } = await import("next/headers");
  const { auth } = await import("@/lib/better-auth/config");
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export default async function AdminOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const ADMIN_NAV: MobileNavLink[] = [
    { href: `/admin/orgs/${orgId}/dashboard`, label: "Dashboard", icon: "dashboard" },
    { href: `/admin/orgs/${orgId}/projects`, label: "Projects", icon: "projects" },
    { href: `/admin/orgs/${orgId}/work-requests`, label: "Work requests", icon: "work-requests" },
  ];

  const orgsR = await adminListOrgsAction();
  if (!orgsR.ok) notFound();
  const org = orgsR.data.find((o) => o.id === orgId);
  if (!org) notFound();

  const session = await auth.api.getSession({ headers: await headers() });

  const notifs = await adminListNotificationsAction(orgId, { filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-5">
            <MobileNavSheet links={ADMIN_NAV} />
            <Link href={`/admin/orgs/${orgId}/dashboard`} className="flex items-center gap-1.5 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
              Marketing CRM
              <span className="rounded border border-slate-200 px-1 text-[10px] uppercase tracking-[0.06em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Admin
              </span>
            </Link>
            <nav aria-label="Admin" className="hidden items-center gap-0.5 text-sm md:flex">
              <Link href={`/admin/orgs/${orgId}/dashboard`} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </Link>
              <Link href={`/admin/orgs/${orgId}/projects`} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                <FolderKanban className="h-3.5 w-3.5" />
                Projects
              </Link>
              <Link href={`/admin/orgs/${orgId}/work-requests`} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50">
                <Inbox className="h-3.5 w-3.5" />
                Work requests
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-1.5">
            <SearchInput searchHref={`/admin/orgs/${orgId}/search`} />
            <ThemeToggle />
            <NotificationsBell initialUnreadCount={initialUnread} href={`/admin/orgs/${orgId}/notifications`} />
            <span className="mx-1 hidden h-4 w-px bg-slate-200 dark:bg-slate-700 md:inline-block" aria-hidden="true" />
            <span className="hidden max-w-[120px] truncate text-xs text-slate-500 dark:text-slate-400 md:inline" title={org.name}>
              {org.name}
            </span>
            <Link
              href="/admin/settings/profile"
              className="hidden max-w-[140px] truncate rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-50 md:inline-block"
            >
              {session?.user.name ?? session?.user.email}
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
