import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  log.info("gc-pending cron invoked (Phase 1: stub — implementation in Plan 4)");
  return NextResponse.json({ ok: true, deleted: 0 });
}
