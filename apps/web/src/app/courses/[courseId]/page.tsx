import { CourseOverview } from "@/features/course-reader";

type CoursePageProps = {
  params: Promise<{ courseId: string }>;
};

export default async function CoursePage({ params }: CoursePageProps) {
  const { courseId } = await params;

  return <CourseOverview courseId={courseId} />;
}
