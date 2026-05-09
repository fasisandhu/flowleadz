import { listProjectsAction } from "@/lib/server-actions/projects";
import { WorkRequestForm } from "@/components/app/work-request-form";

export default async function CustomerNewRequestPage() {
  const r = await listProjectsAction({ status: "active" });
  const projects = r.ok ? r.data.map((p) => ({ id: p.id, name: p.name })) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New work request</h1>
      <p className="text-sm text-slate-600">
        Tell us what you need. We&apos;ll route it to the right team.
      </p>
      <WorkRequestForm projects={projects} />
    </div>
  );
}
