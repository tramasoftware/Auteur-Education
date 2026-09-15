import { PlaceholderPage } from "@/components/layout";
import { AdminFeature } from "@/features/admin";

export default function AdminPage() {
  return (
    <PlaceholderPage
      title="Admin"
      description="Internal tools for users, subscriptions, generation jobs, and operational recovery."
    >
      <AdminFeature />
    </PlaceholderPage>
  );
}
