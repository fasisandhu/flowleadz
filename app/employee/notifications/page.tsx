import { PageHeader } from "@/components/app/page-header";
import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { EmployeeNotificationsList } from "@/components/app/employee-notifications-list";

export default async function EmployeeNotificationsPage() {
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
      <EmployeeNotificationsList initial={initial} />
    </div>
  );
}
