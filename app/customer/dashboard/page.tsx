import Link from "next/link";
import { ArrowRight, FolderKanban, Inbox, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { listRecentActivityAction } from "@/lib/server-actions/tasks";
import { listProjectsAction } from "@/lib/server-actions/projects";
import { listWorkRequestsAction } from "@/lib/server-actions/work-requests";

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  completed: "bg-slate-400",
  archived: "bg-slate-300 dark:bg-slate-600",
  draft: "bg-slate-300 dark:bg-slate-600",
  submitted: "bg-amber-500",
  accepted: "bg-emerald-500",
  rejected: "bg-rose-500",
  duplicate: "bg-slate-400",
};

export default async function CustomerDashboardPage() {
  const [activityR, projectsR, requestsR] = await Promise.all([
    listRecentActivityAction(40),
    listProjectsAction({}),
    listWorkRequestsAction({}),
  ]);
  const activity = activityR.ok ? activityR.data : [];
  const activeProjects = (projectsR.ok ? projectsR.data : [])
    .filter((p) => p.status === "active")
    .slice(0, 5);
  const openRequests = (requestsR.ok ? requestsR.data : [])
    .filter((r) => r.status === "submitted")
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Recent activity across your projects."
        action={
          <Link
            href="/customer/requests/new"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Plus className="mr-1 h-4 w-4" />
            New work request
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Recent activity
            </h2>
            <ActivityFeed
              events={activity}
              taskHrefFor={(taskId) => `/customer/tasks/${taskId}`}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Open requests
              </h2>
              <Link
                href="/customer/requests"
                className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
              >
                All
              </Link>
            </div>
            {openRequests.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                No open requests.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                {openRequests.map((r) => (
                  <Link
                    key={r.id}
                    href={`/customer/requests/${r.id}`}
                    className="group flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
                  >
                    <span
                      className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[r.status] ?? "bg-slate-400"}`}
                      aria-hidden="true"
                    />
                    <Inbox className="h-3 w-3 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-900 group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
                      {r.title}
                    </span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Active projects
              </h2>
              <Link
                href="/customer/projects"
                className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
              >
                All
              </Link>
            </div>
            {activeProjects.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                No active projects.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                {activeProjects.map((p) => (
                  <Link
                    key={p.id}
                    href={`/customer/projects/${p.id}`}
                    className="group flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
                  >
                    <span
                      className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${STATUS_DOT[p.status] ?? "bg-slate-400"}`}
                      aria-hidden="true"
                    />
                    <FolderKanban className="h-3 w-3 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-900 group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
                      {p.name}
                    </span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
