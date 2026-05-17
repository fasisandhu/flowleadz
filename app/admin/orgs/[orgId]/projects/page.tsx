import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  ProjectList,
  ProjectListItem,
} from "@/components/app/project-list-item";
import { adminListProjectsAction } from "@/lib/server-actions/admin/projects";

export default async function AdminProjectsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const r = await adminListProjectsAction(orgId, {});
  const projects = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} total`}
        action={
          <Link
            href={`/admin/orgs/${orgId}/projects/new`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            <Plus className="mr-1 h-4 w-4" />
            New project
          </Link>
        }
      />

      {projects.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          No projects yet. Create one to get started.
        </p>
      ) : (
        <ProjectList>
          {projects.map((p) => (
            <ProjectListItem
              key={p.id}
              project={p}
              href={`/admin/orgs/${orgId}/projects/${p.id}`}
            />
          ))}
        </ProjectList>
      )}
    </div>
  );
}
