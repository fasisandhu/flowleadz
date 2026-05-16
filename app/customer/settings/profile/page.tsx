import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { PageHeader } from "@/components/app/page-header";
import { ProfileSettings } from "@/components/app/profile-settings";
import { NotificationPreferences } from "@/components/app/notification-preferences";
import { Separator } from "@/components/ui/separator";
import { listMyNotificationPreferencesAction } from "@/lib/server-actions/notifications";

export default async function CustomerProfileSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const prefsR = await listMyNotificationPreferencesAction();
  const prefs = prefsR.ok ? prefsR.data : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" subtitle="Manage your account details." />
      <ProfileSettings
        userId={session.user.id}
        name={session.user.name ?? null}
        email={session.user.email}
        image={(session.user as { image?: string | null }).image ?? null}
      />
      <Separator />
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Notification preferences</h2>
        <NotificationPreferences initial={prefs} />
      </section>
    </div>
  );
}
