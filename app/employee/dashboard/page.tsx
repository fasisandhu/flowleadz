import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { listRecentActivityAction } from "@/lib/server-actions/tasks";

export default async function EmployeeDashboardPage() {
  const r = await listRecentActivityAction(20);
  const activity = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="What's happening on your tasks." />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent activity</h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/employee/tasks/${taskId}`}
        />
      </section>
    </div>
  );
}
