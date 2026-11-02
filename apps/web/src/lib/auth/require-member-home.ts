import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { fetchGeneratedCourseCount } from "./entry";
import {
  ACCOUNT_LOAD_ERROR_PATH,
  canAccessMemberHome,
  ONBOARDING_PATH,
} from "./redirect";
import { requireRegistered } from "./require-registered";

/** Registered member with at least one generated course (DEC-018). Returns that count. */
export async function requireMemberHome(): Promise<number> {
  await requireRegistered();
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  let count: number | null = null;
  try {
    count = await fetchGeneratedCourseCount(data.session?.access_token);
  } catch {
    redirect(ACCOUNT_LOAD_ERROR_PATH);
  }
  if (count === null) {
    redirect(ACCOUNT_LOAD_ERROR_PATH);
  }
  if (!canAccessMemberHome(count)) {
    redirect(ONBOARDING_PATH);
  }
  return count;
}
