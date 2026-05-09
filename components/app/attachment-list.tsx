import Link from "next/link";
import { FileText } from "lucide-react";
import {
  listAttachmentsForParentAction,
  getAttachmentDownloadUrlAction,
} from "@/lib/server-actions/attachments";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export async function AttachmentList({
  parentType,
  parentId,
}: {
  parentType: "daily_update" | "work_request" | "task" | "comment";
  parentId: string;
}) {
  const r = await listAttachmentsForParentAction({ parentType, parentId });
  const attachments = r.ok ? r.data : [];

  if (attachments.length === 0) {
    return <p className="text-sm text-slate-500">No attachments.</p>;
  }

  // Resolve presigned URLs in parallel.
  const urls = await Promise.all(
    attachments.map((a) => getAttachmentDownloadUrlAction({ id: a.id })),
  );

  return (
    <ul className="space-y-2">
      {attachments.map((a, i) => {
        const urlResult = urls[i]!;
        const href = urlResult.ok ? urlResult.data.url : null;
        return (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"
          >
            <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />
            {href ? (
              <Link
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                {a.filename}
              </Link>
            ) : (
              <span className="text-slate-500">
                {a.filename} (download unavailable)
              </span>
            )}
            <span className="ml-auto text-xs text-slate-400">
              {formatBytes(Number(a.sizeBytes))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
