import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FolderKanban } from "lucide-react";
import { auth } from "@/lib/better-auth/config";
import { PageHeader } from "@/components/app/page-header";
import { ActivityFeed } from "@/components/app/activity-feed";
import { TaskStatusPill } from "@/components/ui/status-pill";
import {
  listRecentActivityAction,
  listTasksWithCardDataAction,
} from "@/lib/server-actions/tasks";
import { listProjectsAction } from "@/lib/server-actions/projects";
import type { TaskStatus } from "@/lib/constants/status";

export default async function EmployeeDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  const myUserId = session.user.id;

  const [activityR, tasksR, projectsR] = await Promise.all([
    listRecentActivityAction(40),
    listTasksWithCardDataAction({}),
    listProjectsAction({ status: "active" }),
  ]);
  const activity = activityR.ok ? activityR.data : [];
  const allTasks = tasksR.ok ? tasksR.data : [];
  const myOpenTasks = allTasks
    .filter(
      (t) =>
        ["todo", "in_progress", "blocked"].includes(t.status) &&
        t.assignees.some((a) => a.id === myUserId),
    )
    .slice(0, 8);
  const activeProjects = (projectsR.ok ? projectsR.data : []).slice(0, 5);

  const inProgressCount = myOpenTasks.filter((t) => t.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="What's happening on your tasks." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Recent activity
              </h2>
            </div>
            <ActivityFeed
              events={activity}
              taskHrefBase="/employee/tasks"
            />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                My open tasks
              </h2>
              <Link
                href="/employee/tasks"
                className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
              >
                All
              </Link>
            </div>
            {myOpenTasks.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                No open tasks assigned to you.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                {myOpenTasks.map((t) => (
                  <Link
                    key={t.id}
                    href={`/employee/tasks/${t.id}`}
                    className="group flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
                  >
                    <TaskStatusPill status={t.status as TaskStatus} />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-900 group-hover:text-indigo-600 dark:text-slate-50 dark:group-hover:text-indigo-400">
                      {t.title}
                    </span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
                  </Link>
                ))}
              </div>
            )}
            {inProgressCount > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {inProgressCount} in progress right now
              </p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Active projects
              </h2>
              <Link
                href="/employee/projects"
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
                    href={`/employee/projects/${p.id}`}
                    className="group flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 transition last:border-b-0 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/40"
                  >
                    <FolderKanban className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
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
