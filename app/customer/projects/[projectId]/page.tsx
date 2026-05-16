import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listDailyUpdatesAction } from "@/lib/server-actions/daily-updates";
import { listTasksWithCardDataAction } from "@/lib/server-actions/tasks";
import { DailyUpdateCard } from "@/components/app/daily-update-card";
import { TaskCard } from "@/components/app/task-card";

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  completed: "bg-slate-400",
  archived: "bg-slate-300 dark:bg-slate-600",
  draft: "bg-slate-300 dark:bg-slate-600",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  draft: "Draft",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  seo: "SEO",
  paid_ads: "Paid Ads",
  social: "Social",
  content: "Content",
  web: "Web",
  other: "Other",
};

export default async function CustomerProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found") notFound();
    return <p className="text-sm text-red-600 dark:text-red-400">{projectR.error.message}</p>;
  }
  const project = projectR.data;

  const [updatesR, tasksR] = await Promise.all([
    listDailyUpdatesAction({ projectId }),
    listTasksWithCardDataAction({ projectId }),
  ]);

  const updates = updatesR.ok ? updatesR.data : [];
  const upcomingTasks = tasksR.ok
    ? tasksR.data.filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
    : [];

  return (
    <div className="space-y-8">
      <header className="space-y-3 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[project.status] ?? "bg-slate-400"}`}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-500 dark:text-slate-400">
            {SERVICE_TYPE_LABELS[project.serviceType] ?? project.serviceType}
          </span>
          {project.startDate && (
            <>
              <span className="text-slate-400 dark:text-slate-500">·</span>
              <span className="text-slate-500 dark:text-slate-400">
                Started {format(new Date(project.startDate), "MMM d, yyyy")}
              </span>
            </>
          )}
        </div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50">
          {project.name}
        </h1>
        {project.description && (
          <p className="max-w-prose whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
            {project.description}
          </p>
        )}
      </header>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Daily updates
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {updates.length}
          </span>
        </div>
        {updates.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            No updates yet.
          </p>
        ) : (
          <div className="space-y-2">
            {updates.map((u) => (
              <DailyUpdateCard key={u.id} update={u} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
            Upcoming tasks
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            {upcomingTasks.length}
          </span>
        </div>
        {upcomingTasks.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            Nothing on deck.
          </p>
        ) : (
          <div className="space-y-2">
            {upcomingTasks.map((t) => (
              <TaskCard key={t.id} task={t} href={`/customer/tasks/${t.id}`} enableQuickReply />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
