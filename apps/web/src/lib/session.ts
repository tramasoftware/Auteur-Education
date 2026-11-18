import type { Blueprint, ExperienceLevel, LearningRequest } from "@/types/generator";

/**
 * Progress for the course being created in this browser tab.
 * sessionStorage survives a reload of the tab, including the login interrupt.
 * It does not survive a new tab, a new browser session, or "Create my course".
 * This is not the auth session. Course and Blueprint URLs still load from the API
 * when this tab has no in-memory snapshot.
 */

const KEY = "auteur.demo.learningRequestId";
const FLOW_PATH_KEY = "auteur.demo.courseFlowPath";
const ONBOARDING_DRAFT_KEY = "auteur.demo.onboardingDraft";

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

/** Initial intent form at `/onboarding` before this visit has a learning request. */
export function hasStartedOnboarding(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return Boolean(query && new URLSearchParams(query).get("request"));
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

function purgeLegacyLocalStorage(): void {
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(FLOW_PATH_KEY);
  window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
}

function readSessionItem(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  purgeLegacyLocalStorage();
  return window.sessionStorage.getItem(key);
}

function writeSessionItem(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  purgeLegacyLocalStorage();
  window.sessionStorage.setItem(key, value);
}

function removeSessionItem(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  purgeLegacyLocalStorage();
  window.sessionStorage.removeItem(key);
}

export function rememberCourseFlowPath(path: string): void {
  writeSessionItem(FLOW_PATH_KEY, path);
}

export function recallCourseFlowPath(): string | null {
  return readSessionItem(FLOW_PATH_KEY);
}

export function forgetCourseFlowPath(): void {
  removeSessionItem(FLOW_PATH_KEY);
}

export function rememberRequestId(id: string): void {
  writeSessionItem(KEY, id);
}

export function recallRequestId(): string | null {
  return readSessionItem(KEY);
}

export function forgetRequestId(): void {
  removeSessionItem(KEY);
}

const DRAFT_CHANGE_EVENT = "auteur-onboarding-draft";
const EXPERIENCE_LEVELS = new Set<ExperienceLevel>([
  "None",
  "Beginner",
  "Intermediate",
  "Advanced",
]);

/** Form values kept in the browser while sign-in or registration interrupts onboarding. */
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
    const parsed = JSON.parse(raw) as {
      initial_intent?: unknown;
      experience_level?: unknown;
      prior_knowledge?: unknown;
      expected_outcome?: unknown;
    };
    // Older drafts stored "Basic" before the level was renamed to "Beginner".
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

function readOnboardingDraftRaw(): string | null {
  return readSessionItem(ONBOARDING_DRAFT_KEY);
}

export function rememberOnboardingDraft(draft: OnboardingDraft): void {
  if (typeof window === "undefined") {
    return;
  }
  const raw = JSON.stringify(draft);
  cachedDraftRaw = raw;
  cachedDraft = draft;
  writeSessionItem(ONBOARDING_DRAFT_KEY, raw);
  window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
}

export function recallOnboardingDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = readOnboardingDraftRaw();
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
  removeSessionItem(ONBOARDING_DRAFT_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DRAFT_CHANGE_EVENT));
  }
}

/** Last learning request and Blueprint of this tab. Not written to storage. */
let learningRequestSnapshot: LearningRequest | null = null;
let blueprintSnapshot: Blueprint | null = null;

export function rememberLearningRequest(request: LearningRequest): void {
  learningRequestSnapshot = request;
  rememberRequestId(request.id);
}

export function peekLearningRequest(id: string): LearningRequest | null {
  return learningRequestSnapshot?.id === id ? learningRequestSnapshot : null;
}

export function rememberBlueprint(blueprint: Blueprint): void {
  blueprintSnapshot = blueprint;
}

export function peekBlueprint(id: string): Blueprint | null {
  return blueprintSnapshot?.id === id ? blueprintSnapshot : null;
}

/** Drop in-memory copies after the course exists. The tab can still reload from the API. */
export function forgetFlowSnapshots(): void {
  learningRequestSnapshot = null;
  blueprintSnapshot = null;
}

/** Drop this tab's creation progress so the next visit starts a new intention. */
export function beginNewIntention(): void {
  forgetFlowSnapshots();
  forgetRequestId();
  forgetCourseFlowPath();
  forgetOnboardingDraft();
}

export function subscribeOnboardingDraft(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener(DRAFT_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(DRAFT_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}
