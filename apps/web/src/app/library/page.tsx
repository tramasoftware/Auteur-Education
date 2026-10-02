import { PlaceholderPage } from "@/components/layout";
import { LibraryFeature } from "@/features/library";

export default function LibraryPage() {
  return (
    <PlaceholderPage
      title="Your course library"
      description="Courses generated for you, with the newest activity first."
    >
      <LibraryFeature />
    </PlaceholderPage>
  );
}
