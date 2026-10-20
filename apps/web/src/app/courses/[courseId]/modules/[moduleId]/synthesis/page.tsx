import { ModuleDesk } from "@/features/course-reader/ModuleDesk";

type ModuleSynthesisPageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
};

export default async function ModuleSynthesisPage({ params }: ModuleSynthesisPageProps) {
  const { courseId, moduleId } = await params;
  return <ModuleDesk courseId={courseId} moduleId={moduleId} pane="synthesis" />;
}
