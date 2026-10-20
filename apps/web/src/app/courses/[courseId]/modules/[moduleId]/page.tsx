import { ModuleDesk } from "@/features/course-reader/ModuleDesk";

type ModulePageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
};

export default async function ModulePage({ params }: ModulePageProps) {
  const { courseId, moduleId } = await params;
  return <ModuleDesk courseId={courseId} moduleId={moduleId} pane="overview" />;
}
