import { adminListNotificationsAction } from "@/lib/server-actions/admin/notifications";
import { AdminNotificationsList } from "@/components/app/admin-notifications-list";

export default async function AdminNotificationsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const r = await adminListNotificationsAction(orgId, {});
  const initial = r.ok
    ? r.data.notifications.map((n) => ({ ...n, payload: n.payload as Record<string, unknown> }))
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <AdminNotificationsList orgId={orgId} initial={initial} />
    </div>
  );
}
