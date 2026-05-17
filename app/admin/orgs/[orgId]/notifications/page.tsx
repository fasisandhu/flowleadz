import { PageHeader } from "@/components/app/page-header";
import { adminListNotificationsAction } from "@/lib/server-actions/admin/notifications";
import { AdminNotificationsList } from "@/components/app/admin-notifications-list";

export default async function AdminNotificationsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const r = await adminListNotificationsAction(orgId, {});
  const raw = r.ok ? r.data.notifications : [];
  const unread = raw.filter((n) => !n.readAt).length;
  const initial = raw.map((n) => ({
    ...n,
    payload: (n.payload ?? {}) as Record<string, unknown>,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={
          unread > 0
            ? `${unread} unread · ${raw.length} total`
            : `${raw.length} total`
        }
      />
      <AdminNotificationsList orgId={orgId} initial={initial} />
    </div>
  );
}
