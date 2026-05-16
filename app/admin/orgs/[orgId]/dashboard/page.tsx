import Link from "next/link";
import { ArrowRight, Inbox, FolderKanban, Plus, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { InviteUserForm } from "@/components/app/invite-user-form";
import { adminListWorkRequestsAction } from "@/lib/server-actions/admin/work-requests";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";
import { adminListRecentActivityAction } from "@/lib/server-actions/admin/tasks";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  const [submittedR, projectsR, activityR] = await Promise.all([
    adminListWorkRequestsAction(orgId, { status: "submitted" }),
    adminListProjectsAction(orgId, { status: "active" }),
    adminListRecentActivityAction(orgId, 20),
  ]);

  const pending = submittedR.ok ? submittedR.data.length : 0;
  const activeProjects = projectsR.ok ? projectsR.data.length : 0;
  const activity = activityR.ok ? activityR.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        action={<InviteUserForm orgId={orgId} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="group relative overflow-hidden transition hover:shadow-md">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500"
          />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                <Inbox className="h-5 w-5" />
              </div>
              <span className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {pending}
              </span>
            </div>
            <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pending work requests
            </div>
            <Link
              href={`/admin/orgs/${orgId}/work-requests?status=submitted`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              Review queue
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Link>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition hover:shadow-md">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500"
          />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                <FolderKanban className="h-5 w-5" />
              </div>
              <span className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {activeProjects}
              </span>
            </div>
            <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Active projects
            </div>
            <Link
              href={`/admin/orgs/${orgId}/projects`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              View all
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Link>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden transition hover:shadow-md">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"
          />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Plus className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Get started
            </div>
            <Link
              href={`/admin/orgs/${orgId}/projects/new`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              New project
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          Recent activity
        </h2>
        <ActivityFeed
          events={activity}
          taskHrefFor={(taskId) => `/admin/orgs/${orgId}/tasks/${taskId}`}
          orgId={orgId}
        />
      </section>
    </div>
  );
}
