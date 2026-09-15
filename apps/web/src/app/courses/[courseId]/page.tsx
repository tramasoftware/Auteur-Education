import { PlaceholderPage } from "@/components/layout";
import { CourseReaderFeature } from "@/features/course-reader";

type CoursePageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CoursePage({ params }: CoursePageProps) {
  const { courseId } = await params;

  return (
    <PlaceholderPage
      title="Course"
      description={`Published modules and generation status for course ${courseId}.`}
    >
      <CourseReaderFeature />
    </PlaceholderPage>
  );
}
