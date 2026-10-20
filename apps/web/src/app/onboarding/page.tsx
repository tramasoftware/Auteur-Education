import { Suspense } from "react";

import { OnboardingFeature } from "@/features/onboarding";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

export default function OnboardingPage() {
  return (
    <OnboardingScreen>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OnboardingFeature />
      </Suspense>
    </OnboardingScreen>
  );
}
