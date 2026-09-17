import { PlaceholderPage } from "@/components/layout";
import { LessonReader } from "@/features/course-reader";

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
    <PlaceholderPage
      title="Lesson"
      description="Continuous prose written to be read or listened to, with the sources it actually relies on."
    >
      <LessonReader courseId={courseId} moduleId={moduleId} lessonId={lessonId} />
    </PlaceholderPage>
  );
}
