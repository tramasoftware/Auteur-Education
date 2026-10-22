import { Suspense } from "react";

import { OnboardingFeature } from "@/features/onboarding";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { accountSession } from "@/lib/auth/claims";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const session = accountSession(
    error ? undefined : (data?.claims as Record<string, unknown> | undefined),
  );

  return (
    <OnboardingScreen exitHref={session.status === "registered" ? "/home" : "/"}>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OnboardingFeature />
      </Suspense>
    </OnboardingScreen>
  );
}
