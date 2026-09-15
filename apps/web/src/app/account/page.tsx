import { PlaceholderPage } from "@/components/layout";
import { BillingFeature } from "@/features/billing";

export default function AccountPage() {
  return (
    <PlaceholderPage
      title="Account"
      description="Subscription, payment method, generation credits, and session management."
    >
      <BillingFeature />
    </PlaceholderPage>
  );
}
