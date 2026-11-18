"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { courses } from "@/lib/api";
import { useCourseBuildWatch } from "@/lib/useCourseBuildWatch";
import type { CourseStatus } from "@/types/generator";

import {
  forgetModuleReading,
  patchModuleFromStatus,
  peekModuleReading,
  rememberLesson,
  replaceCachedModule,
  subscribeModuleReading,
} from "./module-reading-cache";

function moduleStillBuilding(status: CourseStatus, moduleId: string): boolean {
  if (status.state === "failed") {
    return false;
  }
  const row = status.modules.find((item) => item.id === moduleId);
  if (!row) {
    return false;
  }
  return (
    row.state !== "published" &&
    row.state !== "not_built" &&
    row.state !== "failed"
  );
}

/**
 * Stays mounted across lesson, synthesis, sources and the quiz. One status
 * read stays open until the build saves a change for this module.
 */
export function ModuleReadingScope({
  courseId,
  moduleId,
  children,
}: {
  courseId: string;
  moduleId: string;
  children: ReactNode;
}) {
  const held = useRef<CourseStatus | null>(null);

  const apply = useCallback(
    async (status: CourseStatus) => {
      const change = patchModuleFromStatus(courseId, moduleId, status);
      if (!change) {
        held.current = status;
        return;
      }
      held.current = null;
      if (change.becamePublished) {
        const full = await courses.getModule(courseId, moduleId);
        replaceCachedModule(courseId, moduleId, full);
      }
      await Promise.all(
        change.becameApproved.map(async (id) => {
          if (peekModuleReading(courseId, moduleId)?.lessons.has(id)) {
            return;
          }
          const body = await courses.getLesson(courseId, moduleId, id);
          rememberLesson(courseId, moduleId, body);
        }),
      );
    },
    [courseId, moduleId],
  );

  useCourseBuildWatch(
    courseId,
    true,
    apply,
    (status) => moduleStillBuilding(status, moduleId),
  );

  useEffect(() => {
    return subscribeModuleReading(() => {
      if (held.current && peekModuleReading(courseId, moduleId)) {
        void apply(held.current);
      }
    });
  }, [apply, courseId, moduleId]);

  useEffect(() => {
    return () => {
      forgetModuleReading(courseId, moduleId);
    };
  }, [courseId, moduleId]);

  return children;
}
