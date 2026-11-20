import type { ReactNode } from "react";

import { ModuleReadingScope } from "@/features/course-reader/ModuleReadingScope";

type ModuleLayoutProps = {
  children: ReactNode;
  params: Promise<{
    courseId: string;
    moduleId: string;
  }>;
};

export default async function ModuleLayout({ children, params }: ModuleLayoutProps) {
  const { courseId, moduleId } = await params;
  return (
    <ModuleReadingScope courseId={courseId} moduleId={moduleId}>
      {children}
    </ModuleReadingScope>
  );
}
