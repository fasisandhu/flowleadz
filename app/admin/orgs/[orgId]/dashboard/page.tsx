import Link from "next/link";
import { ArrowRight, Inbox, FolderKanban, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { InviteUserForm } from "@/components/app/invite-user-form";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";
import { adminListRecentActivityAction } from "@/lib/server-actions/admin/tasks";

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  completed: "bg-slate-400",
  archived: "bg-slate-300 dark:bg-slate-600",
  draft: "bg-slate-300 dark:bg-slate-600",
  submitted: "bg-amber-500",
};

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [submittedR, projectsR, activityR] = await Promise.all([
    adminListWorkRequestsAction(orgId, { status: "submitted" }),
    adminListProjectsAction(orgId, { status: "active" }),
    adminListRecentActivityAction(orgId, 40),
  ]);

  const submittedRequests = submittedR.ok ? submittedR.data : [];
  const projects = projectsR.ok ? projectsR.data : [];
  const pending = submittedRequests.length;
  const activeProjectsCount = projects.length;
  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" action={<InviteUserForm orgId={orgId} />} />

      <div className="grid gap-3 md:grid-cols-3">
        <Link
          href={`/admin/orgs/${orgId}/work-requests?status=submitted`}
          className="group flex flex-col rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/40"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Inbox className="h-3.5 w-3.5" />
            Pending requests
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
              {pending}
            </span>
          </div>
          <div className="mt-auto pt-3 text-xs text-slate-500 transition group-hover:text-indigo-600 dark:text-slate-400 dark:group-hover:text-indigo-400">
            Review queue
            <ArrowRight className="ml-1 inline h-3 w-3 transition group-hover:translate-x-0.5" />
          </div>
        </Link>
        <Link
          href={`/admin/orgs/${orgId}/projects`}
          className="group flex flex-col rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/40"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <FolderKanban className="h-3.5 w-3.5" />
            Active projects
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
              {activeProjectsCount}
            </span>
          </div>
          <div className="mt-auto pt-3 text-xs text-slate-500 transition group-hover:text-indigo-600 dark:text-slate-400 dark:group-hover:text-indigo-400">
            View all
            <ArrowRight className="ml-1 inline h-3 w-3 transition group-hover:translate-x-0.5" />
          </div>
        </Link>
        <Link
          href={`/admin/orgs/${orgId}/projects/new`}
          className="group flex flex-col rounded-lg border border-dashed border-slate-300 bg-transparent p-4 transition hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/20"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Plus className="h-3.5 w-3.5" />
            New project
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Start a fresh engagement
          </div>
          <div className="mt-auto pt-3 text-xs text-slate-500 transition group-hover:text-indigo-600 dark:text-slate-400 dark:group-hover:text-indigo-400">
            Create
            <ArrowRight className="ml-1 inline h-3 w-3 transition group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              Recent activity
            </h2>
            <ActivityFeed
              events={activity}
              taskHrefFor={(taskId) => `/admin/orgs/${orgId}/tasks/${taskId}`}
              orgId={orgId}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Review queue
              </h2>
              <Link
                href={`/admin/orgs/${orgId}/work-requests?status=submitted`}
                className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
              >
                All
              </Link>
            </div>
            {submittedRequests.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                Nothing in the queue.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                {submittedRequests.slice(0, 5).map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/orgs/${orgId}/work-requests/${r.id}`}
                    className="group flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
                  >
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-900 group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
                        {r.title}
                      </div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        by {r.submitter.name ?? r.submitter.email}
                      </div>
                    </div>
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
                href={`/admin/orgs/${orgId}/projects`}
                className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
              >
                All
              </Link>
            </div>
            {projects.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                No active projects.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                {projects.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    href={`/admin/orgs/${orgId}/projects/${p.id}`}
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
