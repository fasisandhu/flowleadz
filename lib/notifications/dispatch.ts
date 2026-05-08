import { after } from "next/server";
import { log } from "@/lib/log";

export type AfterTask<T> = () => Promise<T> | T;

export const dispatch = {
  /**
   * Run `task` after the response has been streamed. Errors are caught and
   * logged — they never affect the user-facing request. Phase 2 may swap this
   * for an external queue (Inngest/QStash) by replacing this implementation.
   */
  afterResponse<T>(task: AfterTask<T>): void {
    after(async () => {
      try {
        await task();
      } catch (e) {
        log.error({ err: e }, "Background task failed");
      }
    });
  },
};
