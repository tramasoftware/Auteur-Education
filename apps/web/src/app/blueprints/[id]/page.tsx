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
      description="The pedagogical contract for your course: what will be taught, what is left out, how it progresses, and why. Review it before the course is built."
    >
      <BlueprintFeature blueprintId={id} />
    </PlaceholderPage>
  );
}
