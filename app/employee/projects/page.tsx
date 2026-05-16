import { listProjectsAction } from "@/lib/server-actions/projects";
import { EmptyState } from "@/components/app/empty-state";
import { EmptyProjectsIllustration } from "@/components/app/illustrations/empty-projects";
import { PageHeader } from "@/components/app/page-header";
import {
  ProjectList,
  ProjectListItem,
} from "@/components/app/project-list-item";

export default async function EmployeeProjectsPage() {
  const r = await listProjectsAction({});
  const projects = r.ok ? r.data : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" subtitle={`${projects.length} total`} />

      {projects.length === 0 ? (
        <EmptyState
          illustration={EmptyProjectsIllustration}
          title="No projects yet"
          description="You'll see projects here once they're set up."
        />
      ) : (
        <ProjectList>
          {projects.map((p) => (
            <ProjectListItem
              key={p.id}
              project={p}
              href={`/employee/projects/${p.id}`}
            />
          ))}
        </ProjectList>
      )}
    </div>
  );
}
