/** Same rules as auteur_api.core.redirects.safe_internal_path. */

export const DEFAULT_MEMBER_PATH = "/home";
export const ONBOARDING_PATH = "/onboarding";
export const LANDING_PATH = "/";
export const ACCOUNT_LOAD_ERROR_PATH = "/login?error=account";
export const ACCOUNT_LOAD_ERROR_MESSAGE =
  "We could not load your account. Try again.";

/** DEC-018: home is for members who already have a generated course. */
export function canAccessMemberHome(generatedCourseCount: number): boolean {
  return generatedCourseCount > 0;
}

/** Exit from onboarding: member home when available, otherwise the public landing. */
export function onboardingExitHref(generatedCourseCount: number): string {
  return canAccessMemberHome(generatedCourseCount) ? DEFAULT_MEMBER_PATH : LANDING_PATH;
}

export function isDefaultMemberPath(path: string): boolean {
  return path === DEFAULT_MEMBER_PATH || path === "/";
}

/** UF-06 / DEC-018: a member with no generated course starts in onboarding. */
export function pathAfterSignIn(next: string, generatedCourseCount: number): string {
  if (!isDefaultMemberPath(next)) {
    return next;
  }
  return generatedCourseCount > 0 ? DEFAULT_MEMBER_PATH : ONBOARDING_PATH;
}

export function safeInternalPath(value: string | null, fallback = "/"): string {
  if (!value) {
    return fallback;
  }
  const candidate = value.trim();
  if (!isInternal(candidate)) {
    return fallback;
  }
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }
  if (decoded !== candidate && !isInternal(decoded)) {
    return fallback;
  }
  return candidate;
}

function isInternal(candidate: string): boolean {
  if (!candidate.startsWith("/")) {
    return false;
  }
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return false;
  }
  if (candidate.includes("\\") || candidate.includes("://")) {
    return false;
  }
  return true;
}
