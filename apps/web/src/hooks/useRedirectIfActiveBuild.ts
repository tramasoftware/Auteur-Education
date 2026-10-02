"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchActiveBuildCourseId } from "@/lib/activeBuild";

/**
 * BR-GEN-002: while a build is running, block onboarding / proposals / Blueprint.
 * Sends the learner to the in-progress course overview.
 */
export function useRedirectIfActiveBuild(): boolean {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchActiveBuildCourseId()
      .then((courseId) => {
        if (cancelled) {
          return;
        }
        if (courseId) {
          router.replace(`/courses/${courseId}`);
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return checking;
}
