"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Paperclip } from "lucide-react";
import {
  getUploadUrlAction,
  confirmAttachmentAction,
} from "@/lib/server-actions/attachments";

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
];
const MAX_BYTES = 50 * 1024 * 1024;

export function AttachmentUpload({
  parentType,
  parentId,
}: {
  parentType: "daily_update" | "work_request" | "task" | "comment";
  parentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setProgress(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`File type "${file.type}" is not allowed.`);
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File exceeds the 50 MB limit.`);
      e.target.value = "";
      return;
    }

    const inputEl = e.target;
    startTransition(async () => {
      setProgress("Requesting upload URL…");
      const urlR = await getUploadUrlAction({
        parentType,
        parentId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!urlR.ok) {
        setError(urlR.error.message);
        setProgress(null);
        return;
      }

      setProgress("Uploading…");
      try {
        const putRes = await fetch(urlR.data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!putRes.ok) {
          setError(`Upload failed: ${putRes.status} ${putRes.statusText}`);
          setProgress(null);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
        return;
      }

      setProgress("Confirming…");
      const confirmR = await confirmAttachmentAction({ id: urlR.data.attachmentId });
      if (!confirmR.ok) {
        setError(confirmR.error.message);
        setProgress(null);
        return;
      }

      setProgress(null);
      inputEl.value = "";
      router.refresh();
    });
  }

  const inputId = `attachment-${parentType}-${parentId}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="flex items-center gap-2 text-sm">
        <Paperclip className="h-4 w-4" />
        Attach a file
      </Label>
      <Input
        id={inputId}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        disabled={pending}
        onChange={onChange}
      />
      {progress && <p className="text-xs text-slate-500 dark:text-slate-400">{progress}</p>}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
