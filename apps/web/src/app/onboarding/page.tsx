import { Suspense } from "react";

import { PlaceholderPage } from "@/components/layout";
import { OnboardingFeature } from "@/features/onboarding";

export default function OnboardingPage() {
  return (
    <PlaceholderPage
      title="Start a learning request"
      description="Tell Auteur what you want to learn, your level, and the outcome you want. Auteur will interpret it, check what text and audio can honestly teach, and formulate a learning objective for you to confirm."
    >
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <OnboardingFeature />
      </Suspense>
    </PlaceholderPage>
  );
}
