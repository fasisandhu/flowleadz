import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/better-auth/config";
import { headers } from "next/headers";
import { adminListOrgsAction } from "@/lib/server-actions/admin/orgs";
import { adminListNotificationsAction } from "@/lib/server-actions/admin/notifications";
import { NotificationsBell } from "@/components/app/notifications-bell";

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

  const orgsR = await adminListOrgsAction();
  if (!orgsR.ok) notFound();
  const org = orgsR.data.find((o) => o.id === orgId);
  if (!org) notFound();

  const session = await auth.api.getSession({ headers: await headers() });

  const notifs = await adminListNotificationsAction(orgId, { filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href={`/admin/orgs/${orgId}/dashboard`} className="font-semibold">
              Marketing CRM · Admin
            </Link>
            <nav aria-label="Admin" className="flex items-center gap-4 text-sm">
              <Link href={`/admin/orgs/${orgId}/dashboard`} className="hover:underline">Dashboard</Link>
              <Link href={`/admin/orgs/${orgId}/projects`} className="hover:underline">Projects</Link>
              <Link href={`/admin/orgs/${orgId}/work-requests`} className="hover:underline">Work requests</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell initialUnreadCount={initialUnread} href={`/admin/orgs/${orgId}/notifications`} />
            <span className="text-sm text-slate-600">{org.name}</span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-sm text-slate-600">{session?.user.name ?? session?.user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-sm text-slate-600 hover:underline">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
