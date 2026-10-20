"use client";

import type { ReactNode } from "react";

import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";

import "./course-outline.css";

export function CourseOutlineScreen({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <CourseSetupFrame
      title={title}
      backHref="/library"
      backLabel="My courses"
      backAriaLabel="Back to My courses"
      mainClassName="cur"
      screenClassName="course-outline-screen"
    >
      {children}
    </CourseSetupFrame>
  );
}
