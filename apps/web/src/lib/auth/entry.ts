import type { AccountProfile } from "@/lib/api";
import { textSizeOrStandard } from "@/lib/reading-preference";

import {
  DEFAULT_MEMBER_PATH,
  isDefaultMemberPath,
  pathAfterSignIn,
} from "./redirect";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Server routes: where to send the member, and which reading size to store. */
export async function resolveSignIn(
  next: string,
  accessToken: string | undefined,
): Promise<{ path: string; textSize: string | null }> {
  const profile = await fetchAccountProfile(accessToken);
  const textSize = profile ? textSizeOrStandard(profile.text_size) : null;
  if (!isDefaultMemberPath(next)) {
    return { path: next, textSize };
  }
  if (!accessToken) {
    return { path: next === "/" ? DEFAULT_MEMBER_PATH : next, textSize: null };
  }
  return {
    path: pathAfterSignIn(next, profile?.generated_course_count ?? 0),
    textSize,
  };
}

export async function fetchAccountProfile(
  accessToken: string | undefined,
): Promise<AccountProfile | null> {
  if (!accessToken) {
    return null;
  }
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as AccountProfile;
  } catch {
    return null;
  }
}

export async function fetchGeneratedCourseCount(
  accessToken: string | undefined,
): Promise<number> {
  const profile = await fetchAccountProfile(accessToken);
  return profile?.generated_course_count ?? 0;
}
