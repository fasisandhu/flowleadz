import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { listRecentActivityAction } from "@/lib/server-actions/tasks";

export default async function CustomerDashboardPage() {
  const r = await listRecentActivityAction(20);
  const activity = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Recent activity across your projects."
        action={
          <Link href="/customer/requests/new" className={cn(buttonVariants())}>
            <Plus className="mr-1 h-4 w-4" />
            New work request
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          Recent activity
        </h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/customer/tasks/${taskId}`}
        />
      </section>
    </div>
  );
}
