import { Suspense } from "react";

import { JourneyFrame } from "@/components/layout";
import { OnboardingFeature } from "@/features/onboarding";

export default function OnboardingPage() {
  return (
    <JourneyFrame title="Start a learning request">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OnboardingFeature />
      </Suspense>
    </JourneyFrame>
  );
}
