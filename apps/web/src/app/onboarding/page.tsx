import { Suspense } from "react";

import { OnboardingFeature } from "@/features/onboarding";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { accountSession, type AccountSession } from "@/lib/auth/claims";
import { fetchGeneratedCourseCount } from "@/lib/auth/entry";
import { onboardingExitHref } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const session = accountSession(
    error ? undefined : (data?.claims as Record<string, unknown> | undefined),
  );

  const exitHref = await resolveOnboardingExitHref(session);

  return (
    <OnboardingScreen exitHref={exitHref}>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OnboardingFeature />
      </Suspense>
    </OnboardingScreen>
  );
}

async function resolveOnboardingExitHref(session: AccountSession): Promise<string> {
  if (session.status !== "registered") {
    return "/";
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const count = await fetchGeneratedCourseCount(data.session?.access_token);
  return onboardingExitHref(count);
}
