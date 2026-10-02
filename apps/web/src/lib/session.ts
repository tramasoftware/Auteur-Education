/**
 * Temporary demo-only resume support (UF-05): remember the current learning
 * request in the browser so a reload returns to the last persisted step.
 * Course and Blueprint URLs resume from the API (Postgres when configured).
 * Not an authentication mechanism. Optional JWT: localStorage key
 * `auteur.demo.accessToken` is sent as Bearer when present.
 */

const KEY = "auteur.demo.learningRequestId";
const FLOW_PATH_KEY = "auteur.demo.courseFlowPath";

export function isCourseFlowPath(pathname: string): boolean {
  return (
    pathname === "/onboarding" ||
    pathname.startsWith("/proposals") ||
    pathname.startsWith("/blueprints/")
  );
}

/** Sidebar labels for the course-creation journey (UF-01 → UF-11). */
export type CourseFlowStage = "create" | "onboarding" | "proposals" | "blueprint";

export function courseFlowStageFromPath(pathname: string): CourseFlowStage | null {
  if (pathname.startsWith("/proposals")) {
    return "proposals";
  }
  if (pathname.startsWith("/blueprints/")) {
    return "blueprint";
  }
  return null;
}

/** Initial intent form at `/onboarding` before a learning request exists. */
export function hasStartedOnboarding(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (query && new URLSearchParams(query).get("request")) {
    return true;
  }
  return recallRequestId() !== null;
}

export function courseFlowStageForOnboardingPage(search: string): CourseFlowStage {
  return hasStartedOnboarding(search) ? "onboarding" : "create";
}

export function resolvePlanningStage(
  pathname: string,
  search: string,
  fallback: CourseFlowStage,
): CourseFlowStage {
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    return courseFlowStageForOnboardingPage(search);
  }
  return courseFlowStageFromPath(pathname) ?? fallback;
}

export function courseFlowStageFromHref(href: string): CourseFlowStage {
  const question = href.indexOf("?");
  const pathname = question >= 0 ? href.slice(0, question) : href;
  const search = question >= 0 ? href.slice(question + 1) : "";
  if (pathname === "/onboarding" || pathname.startsWith("/onboarding/")) {
    return courseFlowStageForOnboardingPage(search);
  }
  return courseFlowStageFromPath(pathname) ?? "create";
}

export function rememberCourseFlowPath(path: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FLOW_PATH_KEY, path);
  }
}

export function recallCourseFlowPath(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(FLOW_PATH_KEY);
}

export function forgetCourseFlowPath(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(FLOW_PATH_KEY);
  }
}

export function rememberRequestId(id: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, id);
  }
}

export function recallRequestId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(KEY);
}

export function forgetRequestId(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(KEY);
  }
}
