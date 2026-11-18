import { courses } from "@/lib/api";
import { type CourseFlowStage } from "@/lib/session";

export async function fetchActiveBuildCourseId(): Promise<string | null> {
  const { course_id } = await courses.activeGeneration();
  return course_id;
}

export type CreationNavTarget =
  | { mode: "generating"; href: string; courseId: string }
  | { mode: "planning"; href: string; stage: CourseFlowStage };

/**
 * Sidebar link. An in-flight build still wins (BR-GEN-002).
 * Otherwise start a new intention. This tab's earlier planning is not resumed.
 */
export async function resolveCreationNavTarget(): Promise<CreationNavTarget> {
  const activeCourseId = await fetchActiveBuildCourseId();
  if (activeCourseId) {
    return {
      mode: "generating",
      href: `/courses/${activeCourseId}`,
      courseId: activeCourseId,
    };
  }

  return { mode: "planning", href: "/onboarding?new=1", stage: "create" };
}
