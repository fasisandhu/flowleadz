import { z } from "zod";

export const searchInputSchema = z.object({
  query: z.string().max(500),
  limit: z.number().int().min(1).max(50).default(20),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export type SearchResult =
  | {
      kind: "task";
      id: string;
      title: string;
      snippet: string;
      rank: number;
      projectId: string | null;
    }
  | {
      kind: "update";
      id: string;
      snippet: string;
      rank: number;
      projectId: string;
    }
  | {
      kind: "work_request";
      id: string;
      title: string;
      snippet: string;
      rank: number;
    };
