import Link from "next/link";
import { FileText } from "lucide-react";
import {
  listAttachmentsForParentAction,
  adminListAttachmentsForParentAction,
  getAttachmentDownloadUrlAction,
  adminGetAttachmentDownloadUrlAction,
} from "@/lib/server-actions/attachments";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export async function AttachmentList({
  parentType,
  parentId,
  orgId,
}: {
  parentType: "daily_update" | "work_request" | "task" | "comment";
  parentId: string;
  /** Pass when rendered inside an /admin/orgs/[orgId]/... route. */
  orgId?: string;
}) {
  const r = orgId
    ? await adminListAttachmentsForParentAction(orgId, { parentType, parentId })
    : await listAttachmentsForParentAction({ parentType, parentId });
  if (!r.ok) {
    return <p className="text-sm text-red-600 dark:text-red-400">Could not load attachments.</p>;
  }
  const attachments = r.data;

  if (attachments.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No attachments.</p>;
  }

  // Resolve presigned URLs in parallel.
  const urls = await Promise.all(
    attachments.map((a) =>
      orgId
        ? adminGetAttachmentDownloadUrlAction(orgId, { id: a.id })
        : getAttachmentDownloadUrlAction({ id: a.id }),
    ),
  );

  return (
    <ul className="space-y-2">
      {attachments.map((a, i) => {
        const urlResult = urls[i]!;
        const href = urlResult.ok ? urlResult.data.url : null;
        return (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
            {href ? (
              <Link
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline dark:text-indigo-400"
              >
                {a.filename}
              </Link>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">
                {a.filename} (download unavailable)
              </span>
            )}
            <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
              {formatBytes(Number(a.sizeBytes))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
