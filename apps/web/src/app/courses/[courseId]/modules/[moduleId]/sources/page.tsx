import { ModuleDesk } from "@/features/course-reader/ModuleDesk";

type ModuleSourcesPageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
};

export default async function ModuleSourcesPage({ params }: ModuleSourcesPageProps) {
  const { courseId, moduleId } = await params;
  return <ModuleDesk courseId={courseId} moduleId={moduleId} pane="sources" />;
}
