import { PlaceholderPage } from "@/components/layout";
import { CourseReaderFeature } from "@/features/course-reader";

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
      description={`Text and audio for course ${courseId}, module ${moduleId}, lesson ${lessonId}.`}
    >
      <CourseReaderFeature />
    </PlaceholderPage>
  );
}
