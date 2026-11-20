import { Suspense } from "react";

import { EditorialFrame } from "./EditorialFrame";
import { PlansOffers } from "@/features/billing/PlansOffers";

export function PlansPage() {
  return (
    <EditorialFrame current="plans">
      <Suspense fallback={null}>
        <PlansOffers />
      </Suspense>
    </EditorialFrame>
  );
}
