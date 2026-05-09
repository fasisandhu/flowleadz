import { notFound } from "next/navigation";
import { getProjectAction } from "@/lib/server-actions/projects";
import { listTasksAction } from "@/lib/server-actions/tasks";
import { DailyUpdateForm } from "@/components/app/daily-update-form";

export default async function EmployeeNewUpdatePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const projectR = await getProjectAction(projectId);
  if (!projectR.ok) {
    if (projectR.error.code === "not_found" || projectR.error.code === "unauthorized") notFound();
    return <p className="text-sm text-red-600">{projectR.error.message}</p>;
  }

  const tasksR = await listTasksAction({ projectId });
  const tasks = tasksR.ok
    ? tasksR.data
        .filter((t) => ["todo", "in_progress", "blocked"].includes(t.status))
        .map((t) => ({ id: t.id, title: t.title }))
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Post update — {projectR.data.name}</h1>
      <DailyUpdateForm projectId={projectId} tasks={tasks} />
    </div>
  );
}
