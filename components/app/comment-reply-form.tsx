"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postCommentAction } from "@/lib/server-actions/comments";

export function CommentReplyForm({
  parentType,
  parentId,
  parentCommentId,
  onPosted,
}: {
  parentType: "daily_update" | "task";
  parentId: string;
  parentCommentId?: string;
  onPosted?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const r = await postCommentAction({ parentType, parentId, parentCommentId, body });
    setPending(false);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    setBody("");
    onPosted?.();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Textarea
        placeholder="Reply…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        required
        minLength={1}
        maxLength={5000}
      />
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}
