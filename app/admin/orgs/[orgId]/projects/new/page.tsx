import { ProjectCreateForm } from "@/components/app/project-create-form";

export default async function AdminNewProjectPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New project</h1>
      <ProjectCreateForm orgId={orgId} />
    </div>
  );
}
