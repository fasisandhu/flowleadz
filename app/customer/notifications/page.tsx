import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { NotificationsList } from "@/components/app/notifications-list";

export default async function CustomerNotificationsPage() {
  const r = await listNotificationsAction({});
  const raw = r.ok ? r.data.notifications : [];
  const initial = raw.map((n) => ({
    ...n,
    payload: (n.payload ?? {}) as Record<string, unknown>,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <NotificationsList initial={initial} />
    </div>
  );
}
