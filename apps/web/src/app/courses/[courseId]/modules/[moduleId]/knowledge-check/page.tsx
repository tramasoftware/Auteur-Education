import { ModuleDesk } from "@/features/course-reader/ModuleDesk";

type ModuleKnowledgeCheckPageProps = {
  params: Promise<{ courseId: string; moduleId: string }>;
};

export default async function ModuleKnowledgeCheckPage({
  params,
}: ModuleKnowledgeCheckPageProps) {
  const { courseId, moduleId } = await params;
  return <ModuleDesk courseId={courseId} moduleId={moduleId} pane="quiz" />;
}
