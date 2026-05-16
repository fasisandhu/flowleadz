"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { toggleReactionAction } from "@/lib/server-actions/reactions";
import { ALLOWED_EMOJIS } from "@/lib/services/reactions/schemas";

export type ReactionAggregate = { emoji: string; count: number; mine: boolean };

export function ReactionBar({
  commentId,
  initial,
}: {
  commentId: string;
  initial: ReactionAggregate[];
}) {
  const router = useRouter();
  const [reactions, setReactions] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);

  function onToggle(emoji: string) {
    startTransition(async () => {
      const r = await toggleReactionAction({
        commentId,
        emoji: emoji as (typeof ALLOWED_EMOJIS)[number],
      });
      if (r.ok) {
        setReactions((prev) => {
          const next = [...prev];
          const idx = next.findIndex((x) => x.emoji === emoji);
          if (idx === -1) {
            next.push({ emoji, count: 1, mine: true });
          } else {
            const item = next[idx]!;
            next[idx] = {
              emoji,
              count: item.mine ? item.count - 1 : item.count + 1,
              mine: !item.mine,
            };
            if (next[idx]!.count <= 0) next.splice(idx, 1);
          }
          return next;
        });
        router.refresh();
      }
    });
    setPickerOpen(false);
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={pending}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
            r.mine
              ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
          )}
        >
          <span>{r.emoji}</span>
          <span className="font-medium">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          disabled={pending}
          onClick={() => setPickerOpen((v) => !v)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Add reaction"
        >
          <span className="text-xs">+</span>
        </button>
        {pickerOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 flex gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:shadow-none">
            {ALLOWED_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onToggle(emoji)}
                className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
