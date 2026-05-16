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
    { href: `/admin/orgs/${orgId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `/admin/orgs/${orgId}/projects`, label: "Projects", icon: FolderKanban },
    { href: `/admin/orgs/${orgId}/work-requests`, label: "Work requests", icon: Inbox },
  ];

  const orgsR = await adminListOrgsAction();
  if (!orgsR.ok) notFound();
  const org = orgsR.data.find((o) => o.id === orgId);
  if (!org) notFound();

  const session = await auth.api.getSession({ headers: await headers() });

  const notifs = await adminListNotificationsAction(orgId, { filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <MobileNavSheet links={ADMIN_NAV} />
            <Link href={`/admin/orgs/${orgId}/dashboard`} className="font-semibold">
              Marketing CRM · Admin
            </Link>
            <nav aria-label="Admin" className="hidden items-center gap-4 text-sm md:flex">
              <Link href={`/admin/orgs/${orgId}/dashboard`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link href={`/admin/orgs/${orgId}/projects`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50">
                <FolderKanban className="h-4 w-4" />
                Projects
              </Link>
              <Link href={`/admin/orgs/${orgId}/work-requests`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-50">
                <Inbox className="h-4 w-4" />
                Work requests
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationsBell initialUnreadCount={initialUnread} href={`/admin/orgs/${orgId}/notifications`} />
            <span className="text-sm text-slate-600 dark:text-slate-300">{org.name}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
            <Link
              href="/admin/settings/profile"
              className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-50"
            >
              {session?.user.name ?? session?.user.email}
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="text-sm text-slate-600 hover:underline dark:text-slate-300">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
