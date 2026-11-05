import { courses } from "@/lib/api";
import { buildReadingDesk, type ReadingDeskModel } from "@/lib/course-progress";
import type { CourseProgress, LessonSummary, LibraryCourse } from "@/types/generator";

export async function loadReadingDeskModel(
  item: LibraryCourse,
  library: LibraryCourse[],
  progress: CourseProgress,
): Promise<ReadingDeskModel> {
  const course = await courses.get(item.id);
  const published = course.modules.filter((module) => module.state === "published");
  const details = await Promise.all(
    published.map((module) => courses.getModule(course.id, module.id).catch(() => null)),
  );
  const lessonsByModule: Record<string, LessonSummary[]> = {};
  details.forEach((detail, index) => {
    if (detail) {
      lessonsByModule[published[index].id] = detail.lessons;
    }
  });
  return buildReadingDesk({
    library,
    course,
    progress,
    lessonsByModule,
  });
}
