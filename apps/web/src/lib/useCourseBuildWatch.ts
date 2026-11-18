"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

import { courses } from "@/lib/api";
import type { CourseStatus } from "@/types/generator";

/**
 * The status route stays open for 50s (`_STATUS_WAIT_SECONDS`). A read that
 * outlives that cutoff is a stalled connection, not a quiet build.
 */
const STATUS_READ_LIMIT_MS = 65_000;

/** Caller is not ready for this sample. Keep the watch and read again. */
export type CourseWatchHold = "hold";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function pause(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function openRead(parent: AbortSignal): {
  signal: AbortSignal;
  timedOut: () => boolean;
  cancel: () => void;
} {
  const child = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.abort();
  }, STATUS_READ_LIMIT_MS);
  const onParent = () => child.abort();
  if (parent.aborted) {
    child.abort();
  } else {
    parent.addEventListener("abort", onParent, { once: true });
  }
  return {
    signal: child.signal,
    timedOut: () => timedOut,
    cancel: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", onParent);
    },
  };
}

/**
 * One status read at a time while `active` is true. The first response is
 * immediate. Each later read stays open until the build saves a change
 * (DEC-004). There is no interval.
 *
 * `restartAt` restarts the watch after a new build attempt. `restartEpoch` is
 * the same counter, incremented before React renders, so a sample from the
 * previous attempt (a retry can still observe the old failure) is discarded.
 */
export function useCourseBuildWatch(
  courseId: string,
  active: boolean,
  onStatus: (status: CourseStatus) => Promise<void | CourseWatchHold> | void | CourseWatchHold,
  stillBuilding: (status: CourseStatus) => boolean,
  restartAt = 0,
  restartEpoch?: MutableRefObject<number>,
): void {
  const onStatusRef = useRef(onStatus);
  const stillRef = useRef(stillBuilding);
  const epochRef = useRef(restartEpoch);

  useEffect(() => {
    epochRef.current = restartEpoch;
    onStatusRef.current = onStatus;
    stillRef.current = stillBuilding;
  });

  useEffect(() => {
    if (!active) {
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      let seen: string | null = null;
      while (!controller.signal.aborted) {
        const epoch = epochRef.current;
        const epochAtRead = epoch?.current ?? 0;
        const read = openRead(controller.signal);
        let status: CourseStatus;
        try {
          status = await courses.status(courseId, {
            wait: seen !== null,
            seen,
            signal: read.signal,
          });
        } catch (error) {
          if (controller.signal.aborted || (epoch !== undefined && epoch.current !== epochAtRead)) {
            return;
          }
          if (!read.timedOut() && !isAbortError(error)) {
            await pause(controller.signal, 1000);
          }
          continue;
        } finally {
          read.cancel();
        }
        if (controller.signal.aborted || (epoch !== undefined && epoch.current !== epochAtRead)) {
          return;
        }
        let decision: void | CourseWatchHold = undefined;
        try {
          decision = await onStatusRef.current(status);
        } catch {
          // A failed lesson fetch keeps the watch. The next save retries it.
        }
        if (controller.signal.aborted || (epoch !== undefined && epoch.current !== epochAtRead)) {
          return;
        }
        if (decision === "hold") {
          await pause(controller.signal, 1000);
          continue;
        }
        if (!status.seen || !stillRef.current(status)) {
          return;
        }
        seen = status.seen;
      }
    };
    void run();
    return () => {
      controller.abort();
    };
  }, [active, courseId, restartAt]);
}
