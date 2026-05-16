"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getUploadUrlAction,
  confirmAttachmentAction,
} from "@/lib/server-actions/attachments";
import { updateProfileAction } from "@/lib/server-actions/users";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX = 5 * 1024 * 1024;

export function AvatarUpload({
  userId,
  name,
  email,
  currentImage,
}: {
  userId: string;
  name: string | null;
  email: string;
  currentImage: string | null;
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

    if (!ALLOWED.includes(file.type)) {
      setError(`File type "${file.type}" is not allowed.`);
      e.target.value = "";
      return;
    }
    if (file.size > MAX) {
      setError("File exceeds the 5 MB limit.");
      e.target.value = "";
      return;
    }

    const input = e.target;
    startTransition(async () => {
      setProgress("Requesting upload URL…");
      const urlR = await getUploadUrlAction({
        parentType: "user_avatar",
        parentId: userId,
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
        const put = await fetch(urlR.data.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!put.ok) {
          setError(`Upload failed: ${put.status}`);
          setProgress(null);
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setProgress(null);
        return;
      }

      setProgress("Confirming…");
      const conf = await confirmAttachmentAction({ id: urlR.data.attachmentId });
      if (!conf.ok) {
        setError(conf.error.message);
        setProgress(null);
        return;
      }

      setProgress("Saving…");
      const upd = await updateProfileAction({ avatarAttachmentId: urlR.data.attachmentId });
      setProgress(null);
      if (!upd.ok) {
        setError(upd.error.message);
        return;
      }
      input.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar userId={userId} name={name} email={email} image={currentImage ?? undefined} size="lg" />
      <div className="flex-1 space-y-2">
        <label htmlFor="avatar-input" className="block">
          <span className="sr-only">Upload avatar</span>
          <input
            id="avatar-input"
            type="file"
            accept={ALLOWED.join(",")}
            disabled={pending}
            onChange={onChange}
            className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100 dark:text-slate-400 dark:file:border-slate-700 dark:file:bg-slate-800 dark:file:text-slate-200 dark:hover:file:bg-slate-700"
          />
        </label>
        {progress && <p className="text-xs text-slate-500 dark:text-slate-400">{progress}</p>}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
