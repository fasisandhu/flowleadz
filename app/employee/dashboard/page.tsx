import { Sparkles } from "lucide-react";
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
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          Recent activity
        </h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/employee/tasks/${taskId}`}
        />
      </section>
    </div>
  );
}
