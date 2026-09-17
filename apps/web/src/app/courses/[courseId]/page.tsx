import { PlaceholderPage } from "@/components/layout";
import { CourseOverview } from "@/features/course-reader";

type CoursePageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CoursePage({ params }: CoursePageProps) {
  const { courseId } = await params;

  return (
    <PlaceholderPage
      title="Course"
      description="Modules are published one at a time once they pass review. The state shown is the real state of the build."
    >
      <CourseOverview courseId={courseId} />
    </PlaceholderPage>
  );
}
