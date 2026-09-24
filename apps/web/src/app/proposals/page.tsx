import { Suspense } from "react";

import { JourneyFrame } from "@/components/layout";
import { ProposalsFeature } from "@/features/proposals";

export default function ProposalsPage() {
  return (
    <JourneyFrame
      title="Learning directions"
      description="Genuinely different ways to approach your objective. Pick one before Auteur drafts the Blueprint."
    >
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ProposalsFeature />
      </Suspense>
    </JourneyFrame>
  );
}
