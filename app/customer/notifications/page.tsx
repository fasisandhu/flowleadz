import { PageHeader } from "@/components/app/page-header";
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { NotificationsList } from "@/components/app/notifications-list";

export default async function CustomerNotificationsPage() {
  const r = await listNotificationsAction({});
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
      <NotificationsList initial={initial} />
    </div>
  );
}
