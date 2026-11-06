import { buildReadingDesk, type ReadingDeskModel } from "@/lib/course-progress";
import type { Course, LessonSummary, LibraryCourse } from "@/types/generator";

/** Reading desk from the library payload. No further course or module reads. */
export function readingDeskModel(
  item: LibraryCourse,
  library: LibraryCourse[],
): ReadingDeskModel {
  const lessonsByModule: Record<string, LessonSummary[]> = {};
  for (const lesson of item.lessons) {
    const bucket = lessonsByModule[lesson.module_id] ?? [];
    bucket.push({
      id: lesson.id,
      index: lesson.index,
      title: lesson.title,
      purpose: "",
      word_count: lesson.word_count,
    });
    lessonsByModule[lesson.module_id] = bucket;
  }
  const course: Course = {
    id: item.id,
    request_id: "",
    blueprint_id: "",
    blueprint_version: 0,
    title: item.title,
    subtitle: item.subtitle,
    objective_statement: item.objective_statement,
    state: item.state,
    current_activity: null,
    modules: item.modules.map((module) => ({
      id: module.id,
      index: module.index,
      title: module.title,
      function: "",
      guiding_questions: [],
      outcome: "",
      state: module.state,
      lesson_count: lessonsByModule[module.id]?.length ?? 0,
      published_at: null,
      lessons: (lessonsByModule[module.id] ?? []).map((lesson) => ({
        id: lesson.id,
        index: lesson.index,
        title: lesson.title,
        word_count: lesson.word_count,
      })),
      has_synthesis: false,
      source_count: 0,
      question_count: null,
    })),
    final_synthesis: null,
    failure: null,
    module_limit: null,
    created_at: item.created_at,
  };
  return buildReadingDesk({
    library,
    course,
    progress: item.progress,
    lessonsByModule,
  });
}
