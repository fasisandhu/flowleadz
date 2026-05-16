import { z } from "zod";
import { idSchema } from "@/lib/services/_schemas/common";

export const ALLOWED_EMOJIS = ["👍", "❤️", "🎉", "✅", "👀", "🙏"] as const;
export type Emoji = (typeof ALLOWED_EMOJIS)[number];

const emojiSchema = z.enum(ALLOWED_EMOJIS as readonly [string, ...string[]]);

export const toggleReactionInputSchema = z.object({
  commentId: idSchema,
  emoji: emojiSchema,
});
export type ToggleReactionInput = z.infer<typeof toggleReactionInputSchema>;
