import type {
  Course,
  CourseProgress,
  LessonSummary,
  LibraryCourse,
  ModuleState,
  ModuleSummary,
} from "@/types/generator";

const WORDS_PER_MINUTE = 180;

export function pad(index: number): string {
  return String(index).padStart(2, "0");
}

export function readingMinutes(wordCount: number): number {
  if (wordCount <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

export function byCreation(items: LibraryCourse[]): LibraryCourse[] {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    const leftKey = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
    const rightKey = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;
    if (leftKey !== rightKey) {
      return leftKey - rightKey;
    }
    return left.id.localeCompare(right.id);
  });
}

export function inProgressCount(
  items: LibraryCourse[],
  progress: Map<string, CourseProgress>,
): number {
  return inProgressCourses(items, progress).length;
}

function compareByRecentStudy(
  left: LibraryCourse,
  right: LibraryCourse,
  progress: Map<string, CourseProgress>,
): number {
  const leftActivity = Date.parse(progress.get(left.id)?.last_activity_at ?? "");
  const rightActivity = Date.parse(progress.get(right.id)?.last_activity_at ?? "");
  const leftHas = !Number.isNaN(leftActivity);
  const rightHas = !Number.isNaN(rightActivity);
  if (leftHas !== rightHas) {
    return leftHas ? -1 : 1;
  }
  if (leftHas && rightHas && leftActivity !== rightActivity) {
    return rightActivity - leftActivity;
  }
  const leftUpdated = Date.parse(left.updated_at);
  const rightUpdated = Date.parse(right.updated_at);
  if (leftUpdated !== rightUpdated) {
    return (Number.isNaN(rightUpdated) ? 0 : rightUpdated) -
      (Number.isNaN(leftUpdated) ? 0 : leftUpdated);
  }
  return left.id.localeCompare(right.id);
}

/** Courses currently being read, most recently studied first. */
export function inProgressCourses(
  items: LibraryCourse[],
  progress: Map<string, CourseProgress>,
): LibraryCourse[] {
  return items
    .filter((item) => progress.get(item.id)?.learning_status === "in_progress")
    .sort((left, right) => compareByRecentStudy(left, right, progress));
}

/** The course to put on the reading desk: latest study activity, else latest build. */
export function chooseDeskCourse(
  items: LibraryCourse[],
  progress: Map<string, CourseProgress>,
): LibraryCourse | null {
  const active = inProgressCourses(items, progress);
  if (active.length > 0) {
    return active[0];
  }
  if (items.length === 0) {
    return null;
  }
  return [...items].sort((left, right) => compareByRecentStudy(left, right, progress))[0];
}

export function folderNumber(items: LibraryCourse[], courseId: string): string {
  const index = byCreation(items).findIndex((item) => item.id === courseId);
  return pad(index < 0 ? 1 : index + 1);
}

export function resumeHref(courseId: string, progress: CourseProgress): string {
  if (progress.synthesis_auto_open_pending) {
    return `/courses/${courseId}#final-synthesis`;
  }
  const lessonId = progress.resume_lesson_id;
  const lesson = progress.lessons.find((item) => item.lesson_id === lessonId);
  if (lessonId && lesson) {
    return `/courses/${courseId}/modules/${lesson.module_id}/lessons/${lessonId}`;
  }
  return `/courses/${courseId}`;
}

export function continueLabel(progress: CourseProgress): string {
  if (progress.synthesis_auto_open_pending) {
    return "Open the final synthesis";
  }
  if (progress.learning_status === "completed") {
    return "Review the course";
  }
  if (progress.lessons_read === 0) {
    return "Start reading";
  }
  return "Continue reading";
}

function availability(state: ModuleState): string {
  switch (state) {
    case "published":
      return "Ready to read";
    case "failed":
      return "Could not be prepared";
    case "not_built":
      return "Not prepared in this version";
    case "queued":
      return "Not yet prepared";
    default:
      return "Being prepared";
  }
}

export function folderStatusLabel(progress: CourseProgress): string {
  switch (progress.learning_status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    default:
      return "Not started";
  }
}

export function readingCardCopy(
  item: LibraryCourse,
  progress: CourseProgress,
): { blurb: string; fraction: string; percent: number } {
  const resume = progress.lessons.find(
    (lesson) => lesson.lesson_id === progress.resume_lesson_id,
  );
  const currentModule = progress.modules.find(
    (entry) => entry.module_id === resume?.module_id,
  );
  let position = "";
  if (progress.lesson_total === 0) {
    position = "This course has no lessons yet.";
  } else if (progress.learning_status === "completed") {
    position = "You’ve read every lesson in this course.";
  } else if (progress.learning_status === "not_started") {
    position = currentModule
      ? `Module ${pad(currentModule.index)} is ready to read.`
      : "Ready to start.";
  } else if (currentModule && currentModule.lesson_total > 0) {
    position = `Module ${pad(currentModule.index)} · ${currentModule.lessons_read} of ${currentModule.lesson_total} lessons read.`;
  } else {
    position = `${progress.lessons_read} of ${progress.lesson_total} lessons read.`;
  }
  const about = item.subtitle.trim() || item.objective_statement.trim();
  return {
    blurb: [about, position].filter(Boolean).join(" "),
    fraction:
      progress.lesson_total > 0
        ? `${progress.lessons_read} of ${progress.lesson_total}`
        : "0 lessons",
    percent: progress.percent ?? 0,
  };
}

export type DeskLesson = {
  id: string;
  number: string;
  title: string;
  mark: string;
};

export type DeskModule = {
  id: string;
  label: string;
  title: string;
  lead: string | null;
  meta: string | null;
  lessons: DeskLesson[];
  done: boolean;
  current: boolean;
  queued: boolean;
  action: { label: string; href: string } | null;
};

export type DeskPathStep = {
  title: string;
  detail: string;
  state: "done" | "current" | "";
};

export type ReadingDeskModel = {
  courseId: string;
  title: string;
  kicker: string;
  folderNumber: string;
  headline: string;
  resumeLine: string;
  lessonsRead: number;
  lessonTotal: number;
  continueHref: string;
  continueLabel: string;
  modulePosition: string;
  currentModuleTitle: string;
  openIndex: number;
  modules: DeskModule[];
  path: DeskPathStep[];
};

export function buildReadingDesk(input: {
  library: LibraryCourse[];
  course: Course;
  progress: CourseProgress;
  lessonsByModule: Record<string, LessonSummary[]>;
}): ReadingDeskModel {
  const { course, progress, lessonsByModule } = input;
  const modules = [...course.modules].sort((left, right) => left.index - right.index);
  const resumeId = progress.resume_lesson_id;
  const resumeRow = progress.lessons.find((lesson) => lesson.lesson_id === resumeId) ?? null;
  const resumeModule =
    modules.find((module) => module.id === resumeRow?.module_id) ??
    modules.find((module) => module.state === "published") ??
    modules[0] ??
    null;
  const resumeLessons = resumeModule ? (lessonsByModule[resumeModule.id] ?? []) : [];
  const resumeLesson = resumeLessons.find((lesson) => lesson.id === resumeId) ?? null;
  const readIds = new Set(
    progress.lessons.filter((lesson) => lesson.read).map((lesson) => lesson.lesson_id),
  );
  const href = resumeHref(course.id, progress);
  const label = continueLabel(progress);
  const openIndex = resumeModule
    ? Math.max(0, modules.findIndex((module) => module.id === resumeModule.id))
    : 0;

  const deskModules = modules.map((module) =>
    deskModule(course.id, module, progress, lessonsByModule[module.id] ?? [], {
      isResume: module.id === resumeModule?.id,
      resumeLesson,
      readIds,
      continueHref: href,
      continueLabel: label,
    }),
  );

  const headline = resumeLesson?.title ?? resumeModule?.title ?? course.title;
  const minutes = resumeLesson ? readingMinutes(resumeLesson.word_count) : 0;
  const resumeLine = resumeLesson
    ? `Module ${pad(resumeModule?.index ?? 1)} · Lesson ${pad(resumeLesson.index)}${minutes ? ` · ${minutes} min read` : ""}`
    : resumeModule
      ? `Module ${pad(resumeModule.index)} · ${availability(resumeModule.state)}`
      : course.subtitle.trim() || "Your course";

  return {
    courseId: course.id,
    title: course.title,
    kicker: course.subtitle.trim() || "Your course",
    folderNumber: folderNumber(input.library, course.id),
    headline,
    resumeLine,
    lessonsRead: progress.lessons_read,
    lessonTotal: progress.lesson_total,
    continueHref: href,
    continueLabel: label,
    modulePosition: resumeModule
      ? `Module ${pad(resumeModule.index)} of ${pad(modules.length)}`
      : "Your course",
    currentModuleTitle: resumeModule?.title ?? course.title,
    openIndex,
    modules: deskModules,
    path: modules.map((module) => {
      const desk = deskModules.find((item) => item.id === module.id);
      return {
        title: module.title,
        detail: pathDetail(module, progress, lessonsByModule[module.id] ?? [], resumeLesson, desk?.current ?? false),
        state: desk?.done ? "done" : desk?.current ? "current" : "",
      };
    }),
  };
}

function pathDetail(
  module: ModuleSummary,
  progress: CourseProgress,
  lessons: LessonSummary[],
  resumeLesson: LessonSummary | null,
  current: boolean,
): string {
  const learning = progress.modules.find((item) => item.module_id === module.id);
  if (module.state !== "published") {
    return availability(module.state);
  }
  if (learning?.learning_status === "completed") {
    return "Complete";
  }
  if (current && resumeLesson && lessons.some((lesson) => lesson.id === resumeLesson.id)) {
    return `You’re here · Lesson ${resumeLesson.index} of ${lessons.length}`;
  }
  if (learning && learning.lessons_read > 0) {
    return `${learning.lessons_read} of ${learning.lesson_total} read`;
  }
  return "Ready to read";
}

function deskModule(
  courseId: string,
  module: ModuleSummary,
  progress: CourseProgress,
  lessons: LessonSummary[],
  context: {
    isResume: boolean;
    resumeLesson: LessonSummary | null;
    readIds: Set<string>;
    continueHref: string;
    continueLabel: string;
  },
): DeskModule {
  const learning = progress.modules.find((item) => item.module_id === module.id);
  const published = module.state === "published";
  const done = learning?.learning_status === "completed";
  const current = context.isResume && published && !done;
  const queued = !published;
  const moduleHref = `/courses/${courseId}/modules/${module.id}`;
  let action: DeskModule["action"] = null;
  if (published && done) {
    action = { label: "Review the module", href: moduleHref };
  } else if (current) {
    action = { label: context.continueLabel, href: context.continueHref };
  } else if (published) {
    action = { label: "View module overview", href: moduleHref };
  }
  const resumeHere =
    context.resumeLesson && lessons.some((lesson) => lesson.id === context.resumeLesson?.id)
      ? context.resumeLesson
      : null;
  return {
    id: module.id,
    label: moduleLabel(module, learning?.learning_status ?? null, learning?.lesson_total ?? lessons.length, current, resumeHere),
    title: module.title,
    lead: null,
    meta:
      lessons.length > 0
        ? lessons
            .map((lesson) => {
              const minutes = readingMinutes(lesson.word_count);
              return `Lesson ${pad(lesson.index)} · ${minutes} min read`;
            })
            .join(" | ")
        : null,
    lessons: published
      ? lessons.map((lesson) => ({
          id: lesson.id,
          number: pad(lesson.index),
          title: lesson.title,
          mark: context.readIds.has(lesson.id)
            ? "Read"
            : readingMinutes(lesson.word_count)
              ? `${readingMinutes(lesson.word_count)} min`
              : "Unread",
        }))
      : [],
    done,
    current,
    queued,
    action,
  };
}

function moduleLabel(
  module: ModuleSummary,
  learning: string | null,
  lessonTotal: number,
  current: boolean,
  resumeLesson: LessonSummary | null,
): string {
  const head = `Module ${pad(module.index)}`;
  if (module.state !== "published") {
    return `${head} · ${availability(module.state).toLowerCase()}`;
  }
  if (learning === "completed") {
    return `${head} · complete`;
  }
  if (current && resumeLesson && lessonTotal > 0) {
    return `${head} · Lesson ${pad(resumeLesson.index)} of ${pad(lessonTotal)}`;
  }
  if (learning === "in_progress") {
    return `${head} · in progress`;
  }
  return `${head} · ready to read`;
}
