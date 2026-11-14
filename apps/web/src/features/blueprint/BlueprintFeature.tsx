"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CheckingGenerationStatus } from "@/components/ui";
import { blueprints } from "@/lib/api";

/** Old Blueprint URLs open the course, or return to the learning paths (DEC-022). */
export function BlueprintFeature({ blueprintId }: { blueprintId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void blueprints.get(blueprintId).then(
      (blueprint) => {
        if (cancelled) {
          return;
        }
        if (blueprint.course_id) {
          router.replace(`/courses/${blueprint.course_id}`);
          return;
        }
        const next = blueprint.request_id
          ? `/proposals?request=${blueprint.request_id}`
          : "/proposals";
        router.replace(next);
      },
      () => {
        if (!cancelled) {
          router.replace("/proposals");
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [blueprintId, router]);

  return <CheckingGenerationStatus />;
}
