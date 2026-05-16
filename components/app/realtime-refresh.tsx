"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "./realtime-provider";

export function RealtimeRefresh() {
  const router = useRouter();
  const realtime = useRealtime();

  React.useEffect(() => {
    return realtime.subscribe(() => {
      router.refresh();
    });
  }, [realtime, router]);

  return null;
}
