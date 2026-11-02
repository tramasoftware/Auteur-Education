import { headers } from "next/headers";

import type { AccountProfile } from "@/lib/api";
import { apiUrl } from "@/lib/public-url";
import { textSizeOrStandard } from "@/lib/reading-preference";

import {
  ACCOUNT_LOAD_ERROR_MESSAGE,
  ACCOUNT_LOAD_ERROR_PATH,
  DEFAULT_MEMBER_PATH,
  isDefaultMemberPath,
  pathAfterSignIn,
} from "./redirect";

function accountLoadErrorPath(next: string): string {
  return `${ACCOUNT_LOAD_ERROR_PATH}&next=${encodeURIComponent(next)}`;
}

/** Server routes: where to send the member, and which reading size to store. */
export async function resolveSignIn(
  next: string,
  accessToken: string | undefined,
): Promise<{ path: string; textSize: string | null }> {
  if (!accessToken) {
    return {
      path: isDefaultMemberPath(next) && next === "/" ? DEFAULT_MEMBER_PATH : next,
      textSize: null,
    };
  }
  let profile: AccountProfile | null;
  try {
    profile = await fetchAccountProfile(accessToken);
  } catch {
    return { path: accountLoadErrorPath(next), textSize: null };
  }
  if (!profile) {
    return { path: accountLoadErrorPath(next), textSize: null };
  }
  const textSize = textSizeOrStandard(profile.text_size);
  if (!isDefaultMemberPath(next)) {
    return { path: next, textSize };
  }
  return {
    path: pathAfterSignIn(next, profile.generated_course_count ?? 0),
    textSize,
  };
}

export async function fetchAccountProfile(
  accessToken: string | undefined,
): Promise<AccountProfile | null> {
  if (!accessToken) {
    return null;
  }
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host")?.split(",")[0]?.trim() || headerList.get("host");
  let response: Response;
  try {
    response = await fetch(apiUrl("/api/v1/auth/profile", host), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    throw new Error(ACCOUNT_LOAD_ERROR_MESSAGE);
  }
  if (response.status === 401) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) {
    throw new Error(ACCOUNT_LOAD_ERROR_MESSAGE);
  }
  return (await response.json()) as AccountProfile;
}

export async function fetchGeneratedCourseCount(
  accessToken: string | undefined,
): Promise<number> {
  if (!accessToken) {
    return 0;
  }
  const profile = await fetchAccountProfile(accessToken);
  if (!profile) {
    throw new Error(ACCOUNT_LOAD_ERROR_MESSAGE);
  }
  return profile.generated_course_count ?? 0;
}
