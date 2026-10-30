import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { fetchGeneratedCourseCount } from "./entry";
import { canAccessMemberHome, ONBOARDING_PATH } from "./redirect";
import { requireRegistered } from "./require-registered";

/** Registered member with at least one generated course (DEC-018). Returns that count. */
export async function requireMemberHome(): Promise<number> {
  await requireRegistered();
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const count = await fetchGeneratedCourseCount(data.session?.access_token);
  if (!canAccessMemberHome(count)) {
    redirect(ONBOARDING_PATH);
  }
  return count;
}
