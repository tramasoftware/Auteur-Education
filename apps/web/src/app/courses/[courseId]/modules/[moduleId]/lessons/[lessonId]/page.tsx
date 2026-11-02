import { ModuleDesk } from "@/features/course-reader/ModuleDesk";

type LessonPageProps = {
  params: Promise<{
    courseId: string;
    moduleId: string;
    lessonId: string;
  }>;
};

export default async function LessonPage({ params }: LessonPageProps) {
  const { courseId, moduleId, lessonId } = await params;
  return (
    <ModuleDesk courseId={courseId} moduleId={moduleId} pane="lesson" lessonId={lessonId} />
  );
}
