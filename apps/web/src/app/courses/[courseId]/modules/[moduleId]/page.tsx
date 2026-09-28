import { PlaceholderPage } from "@/components/layout";
import { ModuleView } from "@/features/course-reader";

type ModulePageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
};

export default async function ModulePage({ params }: ModulePageProps) {
  const { courseId, moduleId } = await params;

  return (
    <PlaceholderPage
      title="Module"
      description="Lessons, synthesis, sources and an optional Knowledge Check."
    >
      <ModuleView courseId={courseId} moduleId={moduleId} />
    </PlaceholderPage>
  );
}
