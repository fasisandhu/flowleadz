import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";
import { PageHeader } from "@/components/app/page-header";
import { ProfileSettings } from "@/components/app/profile-settings";

export default async function CustomerProfileSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Profile" subtitle="Manage your account details." />
      <ProfileSettings
        userId={session.user.id}
        name={session.user.name ?? null}
        email={session.user.email}
        image={(session.user as { image?: string | null }).image ?? null}
      />
    </div>
  );
}
