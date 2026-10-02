import { PlaceholderPage } from "@/components/layout";
import { CourseOverview } from "@/features/course-reader";

type CoursePageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CoursePage({ params }: CoursePageProps) {
  const { courseId } = await params;

  return (
    <PlaceholderPage>
      <CourseOverview courseId={courseId} />
    </PlaceholderPage>
  );
}
