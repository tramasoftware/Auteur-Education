"use client";

import type { ReactNode } from "react";

import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";

export function OnboardingScreen({ children }: { children: ReactNode }) {
  return (
    <CourseSetupFrame screenClassName="onboarding-screen" mainClassName="question-main">
      {children}
    </CourseSetupFrame>
  );
}
