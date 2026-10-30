import type { AccountProfile } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

import { accountSession } from "./claims";
import { fetchAccountProfile } from "./entry";

export type LandingAccountSummary = {
  displayName: string;
  avatarUrl: string | null;
};

export function accountDisplayName(profile: AccountProfile): string {
  const fullName = [profile.first_name, profile.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return fullName || "Account";
}

/** Registered member summary for public landing chrome. */
export async function getLandingAccountSummary(): Promise<LandingAccountSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const session = accountSession(
    error ? undefined : (data?.claims as Record<string, unknown> | undefined),
  );
  if (session.status !== "registered") {
    return null;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const profile = await fetchAccountProfile(sessionData.session?.access_token);
  if (!profile) {
    return null;
  }
  return {
    displayName: accountDisplayName(profile),
    avatarUrl: profile.image_url ?? profile.avatar_url,
  };
}
