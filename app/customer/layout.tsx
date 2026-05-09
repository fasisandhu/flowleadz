import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/better-auth/config";
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { NotificationsBell } from "@/components/app/notifications-bell";

async function signOutAction() {
  "use server";
  const { redirect } = await import("next/navigation");
  const { headers } = await import("next/headers");
  const { auth } = await import("@/lib/better-auth/config");
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const notifs = await listNotificationsAction({ filter: "unread", limit: 1 });
  const initialUnread = notifs.ok ? notifs.data.unreadCount : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/customer/dashboard" className="font-semibold">
              Marketing CRM
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/customer/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <Link href="/customer/projects" className="hover:underline">
                Projects
              </Link>
              <Link href="/customer/requests" className="hover:underline">
                Requests
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell initialUnreadCount={initialUnread} />
            <span className="text-sm text-slate-600">{session.user.name ?? session.user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-sm text-slate-600 hover:underline">
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
