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
      controller.enqueue(encoder.encode("retry: 1000\n\n"));

      const onNotification = (msg: { channel: string; payload?: string }) => {
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
        controller.enqueue(encoder.encode(`data: ${msg.payload}\n\n`));
      };

      listenClient.on("notification", onNotification);
      listenClient.on("error", () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      const keepalive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* already closed */
        }
      }, 25_000);

      const cleanup = () => {
        closed = true;
        clearInterval(keepalive);
        listenClient.removeAllListeners();
        listenClient.end().catch(() => {
          /* best effort */
        });
      };

      const hardTimeout = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, (maxDuration - 5) * 1000);

      (controller as unknown as { __cleanup: () => void }).__cleanup = () => {
        clearTimeout(hardTimeout);
        cleanup();
      };
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
