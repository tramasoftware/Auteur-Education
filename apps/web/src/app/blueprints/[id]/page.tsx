import { BlueprintFeature } from "@/features/blueprint";

type BlueprintPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BlueprintPage({ params }: BlueprintPageProps) {
  const { id } = await params;
  return <BlueprintFeature blueprintId={id} />;
}
