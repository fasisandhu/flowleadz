import { headers } from "next/headers";
import { createListenClient } from "@/lib/db/listen-client";
import { resolveSessionContext } from "@/lib/services/_auth/resolve-session-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 280; // Vercel Pro cap is 300s; leave headroom.

export async function GET() {
  const ctx = await resolveSessionContext(await headers());
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { userId, orgId } = ctx;

  const listenClient = createListenClient();
  await listenClient.connect();
  await listenClient.query("LISTEN crm_events");

  let closed = false;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Timer handles live on an object so cleanup() can read them before they
      // are assigned (and clearInterval/clearTimeout are no-ops on undefined).
      const timers: {
        keepalive?: ReturnType<typeof setInterval>;
        hardTimeout?: ReturnType<typeof setTimeout>;
      } = {};

      // Single source of truth for "tear everything down". Idempotent.
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (timers.keepalive) clearInterval(timers.keepalive);
        if (timers.hardTimeout) clearTimeout(timers.hardTimeout);
        listenClient.removeAllListeners();
        listenClient.end().catch(() => {
          /* best effort */
        });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Enqueue if open, tear down on any error (closed controller, etc.).
      // Prevents uncaughtException loops when the pipe is already dead.
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          cleanup();
        }
      };

      safeEnqueue(encoder.encode("retry: 1000\n\n"));

      listenClient.on("notification", (msg: { channel: string; payload?: string }) => {
        if (closed || msg.channel !== "crm_events" || !msg.payload) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.payload);
        } catch {
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = parsed as any;
        if (typeof p?.orgId !== "string") return;
        if (p.orgId !== orgId) return;
        if (p.kind === "notification" && p.userId !== userId) return;
        safeEnqueue(encoder.encode(`data: ${msg.payload}\n\n`));
      });
      listenClient.on("error", cleanup);

      timers.keepalive = setInterval(() => {
        safeEnqueue(encoder.encode(": keepalive\n\n"));
      }, 25_000);

      timers.hardTimeout = setTimeout(cleanup, (maxDuration - 5) * 1000);

      (controller as unknown as { __cleanup: () => void }).__cleanup = cleanup;
    },
    cancel() {
      const c = this as unknown as { __cleanup?: () => void };
      c.__cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
