import type { ExperienceLevel } from "@/types/generator";

/**
 * Resume support (UF-05): remember the current learning request in the browser
 * so a reload returns to the last persisted step. Course and Blueprint URLs
 * resume from the API. This is not the auth session.
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

const ONBOARDING_DRAFT_KEY = "auteur.demo.onboardingDraft";
const EXPERIENCE_LEVELS = new Set<ExperienceLevel>([
  "None",
  "Beginner",
  "Intermediate",
  "Advanced",
]);

/** Form values kept while sign-in interrupts "Analyze my intention". */
export type OnboardingDraft = {
  initial_intent: string;
  experience_level: ExperienceLevel;
  prior_knowledge: string | null;
  expected_outcome: string;
};

// useSyncExternalStore requires the same snapshot object until storage changes.
let cachedDraftRaw: string | null = null;
let cachedDraft: OnboardingDraft | null = null;

function parseOnboardingDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft> & {
      experience_level?: string;
    };
    const experienceLevel =
      parsed.experience_level === "Basic" ? "Beginner" : parsed.experience_level;
    if (
      typeof parsed.initial_intent !== "string" ||
      typeof parsed.expected_outcome !== "string" ||
      !EXPERIENCE_LEVELS.has(experienceLevel as ExperienceLevel) ||
      (parsed.prior_knowledge !== null && typeof parsed.prior_knowledge !== "string")
    ) {
      return null;
    }
    return {
      initial_intent: parsed.initial_intent,
      experience_level: experienceLevel as ExperienceLevel,
      prior_knowledge: parsed.prior_knowledge ?? null,
      expected_outcome: parsed.expected_outcome,
    };
  } catch {
    return null;
  }
}

export function rememberOnboardingDraft(draft: OnboardingDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  const raw = JSON.stringify(draft);
  cachedDraftRaw = raw;
  cachedDraft = draft;
  window.sessionStorage.setItem(ONBOARDING_DRAFT_KEY, raw);
}

export function recallOnboardingDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
  if (raw === cachedDraftRaw) {
    return cachedDraft;
  }
  cachedDraftRaw = raw;
  cachedDraft = parseOnboardingDraft(raw);
  return cachedDraft;
}

export function forgetOnboardingDraft(): void {
  cachedDraftRaw = null;
  cachedDraft = null;
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  }
}
