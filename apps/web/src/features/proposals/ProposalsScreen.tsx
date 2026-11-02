"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";

import "./proposals.css";

export function ProposalsScreen({ children }: { children: ReactNode }) {
  const requestId = useSearchParams().get("request");
  const backHref = requestId ? `/onboarding?request=${requestId}` : "/onboarding";

  return (
    <CourseSetupFrame
      title="Your learning path"
      backHref={backHref}
      backLabel="Learning objective"
      backAriaLabel="Back to your learning objective"
      mainClassName="paths-main"
      screenClassName="proposals-screen"
    >
      {children}
    </CourseSetupFrame>
  );
}
