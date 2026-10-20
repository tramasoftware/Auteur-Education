import { Suspense } from "react";

import { ProposalsFeature, ProposalsScreen } from "@/features/proposals";

export default function ProposalsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ProposalsScreen>
        <ProposalsFeature />
      </ProposalsScreen>
    </Suspense>
  );
}
