"use client";

import { useEffect, useRef } from "react";

/**
 * Re-runs `tick` every `intervalMs` while `active` is true. Used to follow
 * background generation by polling real persisted states (DEC-004).
 */
export function usePolling(
  tick: () => Promise<void> | void,
  active: boolean,
  intervalMs = 4000,
): void {
  const tickRef = useRef(tick);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (!cancelled) {
        await tickRef.current();
      }
    };
    const handle = window.setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [active, intervalMs]);
}
