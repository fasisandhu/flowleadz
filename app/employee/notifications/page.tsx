import { listNotificationsAction } from "@/lib/server-actions/notifications";
import { EmployeeNotificationsList } from "@/components/app/employee-notifications-list";

export default async function EmployeeNotificationsPage() {
  const r = await listNotificationsAction({});
  const initial = r.ok
    ? r.data.notifications.map((n) => ({ ...n, payload: n.payload as Record<string, unknown> }))
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <EmployeeNotificationsList initial={initial} />
    </div>
  );
}
