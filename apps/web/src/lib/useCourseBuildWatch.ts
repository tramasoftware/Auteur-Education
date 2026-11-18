"use client";

import { useEffect, useRef } from "react";

import { courses } from "@/lib/api";
import type { CourseStatus } from "@/types/generator";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

/**
 * One status read at a time while `active` is true. The first response is
 * immediate. Each later read stays open until the build saves a change
 * (DEC-004). There is no interval.
 */
export function useCourseBuildWatch(
  courseId: string,
  active: boolean,
  onStatus: (status: CourseStatus) => Promise<void> | void,
  stillBuilding: (status: CourseStatus) => boolean,
): void {
  const onStatusRef = useRef(onStatus);
  const stillRef = useRef(stillBuilding);

  useEffect(() => {
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
        let status: CourseStatus;
        try {
          status = await courses.status(courseId, {
            wait: seen !== null,
            seen,
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted || isAbortError(error)) {
            return;
          }
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 1000);
            controller.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true },
            );
          });
          continue;
        }
        if (controller.signal.aborted) {
          return;
        }
        try {
          await onStatusRef.current(status);
        } catch {
          // A failed lesson fetch keeps the watch. The next save retries it.
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
  }, [active, courseId]);
}
