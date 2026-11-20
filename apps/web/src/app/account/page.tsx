import type { Metadata } from "next";
import { Suspense } from "react";

import { BillingFeature } from "@/features/billing";
import { EditorialFrame } from "@/features/landing/EditorialFrame";
import { requireRegistered } from "@/lib/auth/require-registered";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing · Auteur Education",
  description: "Provisional credits, payments and subscription status.",
};

export default async function AccountPage() {
  await requireRegistered();
  return (
    <EditorialFrame>
      <Suspense fallback={null}>
        <BillingFeature />
      </Suspense>
    </EditorialFrame>
  );
}
