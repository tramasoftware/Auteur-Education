import { Suspense } from "react";

import { PlaceholderPage } from "@/components/layout";
import { ProposalsFeature } from "@/features/proposals";

export default function ProposalsPage() {
  return (
    <PlaceholderPage
      title="Learning directions"
      description="Genuinely different ways to approach your objective. Pick one before Auteur drafts the Blueprint."
    >
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <ProposalsFeature />
      </Suspense>
    </PlaceholderPage>
  );
}
