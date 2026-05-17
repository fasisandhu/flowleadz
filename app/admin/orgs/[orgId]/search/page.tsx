import Link from "next/link";
import * as React from "react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { EmptySearchIllustration } from "@/components/app/illustrations/empty-search";
import { adminSearchAction } from "@/lib/server-actions/search";
import type { SearchResult } from "@/lib/services/search";

const KIND_LABELS: Record<string, string> = {
  task: "Task",
  update: "Update",
  work_request: "Work request",
};

function hrefFor(orgId: string, kind: string, row: { id: string; projectId?: string | null }): string {
  if (kind === "task") return `/admin/orgs/${orgId}/tasks/${row.id}`;
  if (kind === "update" && row.projectId) return `/admin/orgs/${orgId}/projects/${row.projectId}`;
  if (kind === "work_request") return `/admin/orgs/${orgId}/work-requests/${row.id}`;
  return "#";
}

function renderSnippet(html: string): React.ReactNode {
  // ts_headline returns text with <mark>...</mark> markers around matches.
  // Split on those exact markers and emit real <mark> JSX; React escapes
  // the surrounding text automatically (no dangerouslySetInnerHTML).
  const parts = html.split(/(<mark>.*?<\/mark>)/g);
  return parts.map((part, i) => {
    if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
      return (
        <mark
          key={i}
          className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
        >
          {part.slice(6, -7)}
        </mark>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export default async function AdminSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgId } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let results: SearchResult[] = [];
  if (query) {
    const r = await adminSearchAction(orgId, { query, limit: 50 });
    if (r.ok) results = r.data;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Search" subtitle={query ? `Results for "${query}"` : "Type a query above."} />

      {query === "" ? (
        <EmptyState
          illustration={EmptySearchIllustration}
          title="Start typing"
          description="Search everything in this org."
        />
      ) : results.length === 0 ? (
        <EmptyState
          illustration={EmptySearchIllustration}
          title="No matches"
          description="Try different keywords or check your spelling."
        />
      ) : (
        <ul className="space-y-2">
          {results.map((res) => {
            const title: string =
              res.kind === "update" ? "Daily update" : res.title;
            const href = hrefFor(orgId, res.kind, res as { id: string; projectId?: string | null });
            return (
              <li
                key={`${res.kind}-${res.id}`}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
              >
                <Link href={href} className="block">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      {KIND_LABELS[res.kind]}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {title}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {renderSnippet(res.snippet)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
