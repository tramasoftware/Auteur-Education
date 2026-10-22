"use client";

import type { ReactNode } from "react";

import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";

export function OnboardingScreen({
  children,
  exitHref = "/",
}: {
  children: ReactNode;
  exitHref?: string;
}) {
  return (
    <CourseSetupFrame
      screenClassName="onboarding-screen"
      mainClassName="question-main"
      backHref={exitHref}
    >
      {children}
    </CourseSetupFrame>
  );
}
