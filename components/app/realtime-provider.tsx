"use client";

import * as React from "react";

type Listener = (data: unknown) => void;

type RealtimeContextValue = {
  subscribe: (listener: Listener) => () => void;
};

const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = React.useRef<Set<Listener>>(new Set());
  const sourceRef = React.useRef<EventSource | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const source = new EventSource("/api/events/stream");
      sourceRef.current = source;

      source.onmessage = (e) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          return;
        }
        for (const listener of listenersRef.current) {
          try {
            listener(parsed);
          } catch {
            /* listener errors don't break the stream */
          }
        }
      };

      source.onerror = () => {
        source.close();
        sourceRef.current = null;
        setTimeout(() => {
          if (!cancelled) connect();
        }, 2000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  const value = React.useMemo<RealtimeContextValue>(
    () => ({
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
    }),
    [],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = React.useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used inside <RealtimeProvider>");
  }
  return ctx;
}
