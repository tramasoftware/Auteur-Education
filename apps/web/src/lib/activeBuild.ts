import { courses, learningRequests } from "@/lib/api";
import {
  courseFlowStageFromHref,
  forgetCourseFlowPath,
  forgetRequestId,
  isCourseFlowPath,
  recallCourseFlowPath,
  recallRequestId,
  type CourseFlowStage,
} from "@/lib/session";
export async function fetchActiveBuildCourseId(): Promise<string | null> {
  const { course_id } = await courses.activeGeneration();
  return course_id;
}

export type CreationNavTarget =
  | { mode: "generating"; href: string; courseId: string }
  | { mode: "planning"; href: string; stage: CourseFlowStage };

/** Sidebar link: active build wins; otherwise resume open planning or fresh onboarding. */
export async function resolveCreationNavTarget(): Promise<CreationNavTarget> {
  const activeCourseId = await fetchActiveBuildCourseId();
  if (activeCourseId) {
    return {
      mode: "generating",
      href: `/courses/${activeCourseId}`,
      courseId: activeCourseId,
    };
  }

  await clearStalePlanningSession();

  const remembered = recallCourseFlowPath();
  if (remembered) {
    const pathname = remembered.split("?")[0] ?? remembered;
    if (isCourseFlowPath(pathname)) {
      return {
        mode: "planning",
        href: remembered,
        stage: courseFlowStageFromHref(remembered),
      };
    }
    forgetCourseFlowPath();
  }

  return { mode: "planning", href: "/onboarding", stage: "create" };
}

async function clearStalePlanningSession(): Promise<void> {
  const requestId = recallRequestId();
  if (!requestId) {
    return;
  }
  try {
    const request = await learningRequests.get(requestId);
    if (request.state === "approved" || request.course_id) {
      forgetRequestId();
      forgetCourseFlowPath();
    }
  } catch {
    forgetRequestId();
    forgetCourseFlowPath();
  }
}
