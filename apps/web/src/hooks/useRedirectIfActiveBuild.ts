"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchActiveBuildCourseId } from "@/lib/activeBuild";

/**
 * BR-GEN-002: a second creation attempt goes to the course already being built.
 * The linear course-setup flow no longer waits on this check at every screen.
 * The screen stays usable while the lookup runs, and only yields if a build exists.
 */
export function useRedirectIfActiveBuild(enabled = true): boolean {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    fetchActiveBuildCourseId()
      .then((courseId) => {
        if (cancelled || !courseId) {
          return;
        }
        setRedirecting(true);
        router.replace(`/courses/${courseId}`);
      })
      .catch(() => {
        // The API still rejects a second build if this lookup fails.
      });

    return () => {
      cancelled = true;
    };
  }, [router, enabled]);

  return redirecting;
}
