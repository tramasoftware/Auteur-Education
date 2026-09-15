import { PlaceholderPage } from "@/components/layout";
import { BlueprintFeature } from "@/features/blueprint";

type BlueprintPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BlueprintPage({ params }: BlueprintPageProps) {
  const { id } = await params;

  return (
    <PlaceholderPage
      title="Blueprint"
      description={`Review and approve the pedagogical contract ${id} before a course is built.`}
    >
      <BlueprintFeature />
    </PlaceholderPage>
  );
}
