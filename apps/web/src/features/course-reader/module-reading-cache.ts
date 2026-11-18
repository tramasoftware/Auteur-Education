"use client";

import { courses } from "@/lib/api";
import type { Course, CourseModule, CourseProgress, CourseStatus, Lesson } from "@/types/generator";

export type ModuleReading = {
  course: Course;
  module: CourseModule;
  lessons: Map<string, Lesson>;
  progress: CourseProgress;
};

const pending = new Map<string, Promise<ModuleReading>>();
const resolved = new Map<string, ModuleReading>();
const sheetPages = new Map<
  string,
  { signature: string; pages: number[][]; page: number }
>();
const progressPending = new Map<string, Promise<CourseProgress>>();
const readingListeners = new Set<() => void>();
let pendingWrite: Promise<void> = Promise.resolve();
let outlinedCourse: Course | null = null;
let progressRevision = 0;
let outlinedProgress: { courseId: string; progress: CourseProgress; revision: number } | null =
  null;

/** Course outline already loaded in this visit. Module reads reuse it. */
export function rememberCourseOutline(course: Course): void {
  outlinedCourse = course;
}

/** Outline from this visit, so the course page can paint before the next GET. */
export function peekCourseOutline(courseId: string): Course | null {
  return outlinedCourse?.id === courseId ? outlinedCourse : null;
}

/** Latest progress for this visit. A newer mark wins over a GET that started earlier. */
export function rememberCourseProgress(courseId: string, progress: CourseProgress): void {
  progressRevision += 1;
  outlinedProgress = { courseId, progress, revision: progressRevision };
}

export function peekCourseProgress(courseId: string): CourseProgress | null {
  return outlinedProgress?.courseId === courseId ? outlinedProgress.progress : null;
}

export function subscribeModuleReading(listener: () => void): () => void {
  readingListeners.add(listener);
  return () => {
    readingListeners.delete(listener);
  };
}

function publish(id: string, pack: ModuleReading): void {
  resolved.set(id, pack);
  for (const listener of readingListeners) {
    listener();
  }
}

/** Course screens wait for an in-flight read mark before loading progress. */
export function afterReadingWrites(): Promise<void> {
  return pendingWrite;
}

export function trackReadingWrite<T>(work: Promise<T>): Promise<T> {
  pendingWrite = pendingWrite
    .catch(() => undefined)
    .then(() => work.then(() => undefined, () => undefined));
  return work;
}

function key(courseId: string, moduleId: string): string {
  return `${courseId}:${moduleId}`;
}

function loadProgress(courseId: string): Promise<CourseProgress> {
  const inflight = progressPending.get(courseId);
  if (inflight) {
    return inflight;
  }
  const started = progressRevision;
  const promise = courses
    .progress(courseId)
    .then((progress) => {
      if (
        outlinedProgress?.courseId === courseId &&
        outlinedProgress.revision !== started
      ) {
        return outlinedProgress.progress;
      }
      outlinedProgress = { courseId, progress, revision: started };
      return progress;
    })
    .finally(() => {
      progressPending.delete(courseId);
    });
  progressPending.set(courseId, promise);
  return promise;
}

/** Shared progress read for the course page and module reads. */
export function loadCourseProgress(courseId: string): Promise<CourseProgress> {
  return loadProgress(courseId);
}

export function replaceModuleProgress(
  courseId: string,
  moduleId: string,
  progress: CourseProgress,
): void {
  rememberCourseProgress(courseId, progress);
  const id = key(courseId, moduleId);
  const ready = resolved.get(id);
  if (ready) {
    publish(id, { ...ready, progress });
  }
}

function approvedLessonIds(module: CourseModule): string[] {
  return module.lessons
    .filter((lesson) => lesson.state === "approved")
    .map((lesson) => lesson.id);
}

function lessonIsApproved(module: CourseModule, lessonId: string | undefined): boolean {
  return approvedLessonIds(module).includes(lessonId ?? "");
}

function addLesson(id: string, lesson: Lesson): ModuleReading | null {
  const current = resolved.get(id);
  if (!current) {
    return null;
  }
  const lessons = new Map(current.lessons);
  lessons.set(lesson.id, lesson);
  const pack = { ...current, lessons };
  publish(id, pack);
  return pack;
}

function prefetchLessonBodies(courseId: string, moduleId: string, lessonIds: string[]): void {
  if (lessonIds.length === 0) {
    return;
  }
  const id = key(courseId, moduleId);
  void Promise.all(
    lessonIds.map((lessonId) => courses.getLesson(courseId, moduleId, lessonId)),
  )
    .then((bodies) => {
      const current = resolved.get(id);
      if (!current) {
        return;
      }
      const merged = new Map(current.lessons);
      for (const lesson of bodies) {
        merged.set(lesson.id, lesson);
      }
      const latest = resolved.get(id) ?? current;
      publish(id, { ...latest, lessons: merged });
    })
    .catch(() => {
      // The open lesson stays readable. The next visit retries the rest.
    });
}

export function peekModuleReading(courseId: string, moduleId: string): ModuleReading | null {
  return resolved.get(key(courseId, moduleId)) ?? null;
}

export function sheetMemoryKey(courseId: string, moduleId: string, pageKey: string): string {
  return `${key(courseId, moduleId)}:${pageKey}`;
}

export function peekSheetPages(
  memoryKey: string,
  signature: string,
): { pages: number[][]; page: number } | null {
  const found = sheetPages.get(memoryKey);
  if (!found || found.signature !== signature) {
    return null;
  }
  return { pages: found.pages, page: found.page };
}

export function rememberSheetPages(
  memoryKey: string,
  signature: string,
  pages: number[][],
  page: number,
): void {
  sheetPages.set(memoryKey, { signature, pages, page });
}

/** Drop this module's reading pack when the reader leaves it. */
export function forgetModuleReading(courseId: string, moduleId: string): void {
  const id = key(courseId, moduleId);
  resolved.delete(id);
  pending.delete(id);
  const prefix = `${id}:`;
  for (const memoryKey of sheetPages.keys()) {
    if (memoryKey.startsWith(prefix)) {
      sheetPages.delete(memoryKey);
    }
  }
}

export function loadModuleReading(
  courseId: string,
  moduleId: string,
  options?: { preferLessonId?: string },
): Promise<ModuleReading> {
  const id = key(courseId, moduleId);
  const preferLessonId = options?.preferLessonId;
  const ready = resolved.get(id);
  const wantsBody = Boolean(ready && lessonIsApproved(ready.module, preferLessonId));
  if (ready && (!preferLessonId || ready.lessons.has(preferLessonId) || !wantsBody)) {
    return Promise.resolve(ready);
  }
  if (ready && preferLessonId && wantsBody) {
    return courses.getLesson(courseId, moduleId, preferLessonId).then((lesson) => {
      const lessons = new Map(ready.lessons);
      lessons.set(lesson.id, lesson);
      const pack = { ...ready, lessons };
      publish(id, pack);
      return pack;
    });
  }
  const inflight = pending.get(id);
  if (inflight) {
    if (!preferLessonId) {
      return inflight;
    }
    return inflight.then(async (pack) => {
      const current = resolved.get(id) ?? pack;
      if (
        current.lessons.has(preferLessonId) ||
        !lessonIsApproved(current.module, preferLessonId)
      ) {
        return current;
      }
      const lesson = await courses.getLesson(courseId, moduleId, preferLessonId);
      const lessons = new Map(resolved.get(id)?.lessons ?? pack.lessons);
      lessons.set(lesson.id, lesson);
      const next = { ...(resolved.get(id) ?? pack), lessons };
      publish(id, next);
      return next;
    });
  }
  const promise = (async () => {
    const knownCourse = outlinedCourse?.id === courseId ? outlinedCourse : null;
    const [course, module, progress] = await Promise.all([
      knownCourse ? Promise.resolve(knownCourse) : courses.get(courseId),
      courses.getModule(courseId, moduleId),
      loadProgress(courseId),
    ]);
    rememberCourseOutline(course);
    const preferred = lessonIsApproved(module, preferLessonId) ? preferLessonId : undefined;
    const pack: ModuleReading = { course, module, lessons: new Map(), progress };
    publish(id, pack);
    const restIds = approvedLessonIds(module).filter((lessonId) => lessonId !== preferred);
    if (preferred) {
      const first = await courses.getLesson(courseId, moduleId, preferred);
      const withLesson = addLesson(id, first) ?? pack;
      prefetchLessonBodies(courseId, moduleId, restIds);
      return withLesson;
    }
    prefetchLessonBodies(courseId, moduleId, restIds);
    return resolved.get(id) ?? pack;
  })().finally(() => {
    pending.delete(id);
  });
  pending.set(id, promise);
  return promise;
}

/** Prefetch the first module that already has a readable lesson. */
export function warmCourseReading(course: Course): Promise<void> {
  rememberCourseOutline(course);
  const first = course.modules.find((module) =>
    module.lessons.some((lesson) => lesson.state === "approved"),
  );
  if (!first || peekModuleReading(course.id, first.id)) {
    return Promise.resolve();
  }
  const lessonId = first.lessons.find((lesson) => lesson.state === "approved")?.id;
  return loadModuleReading(course.id, first.id, { preferLessonId: lessonId }).then(
    () => undefined,
  );
}

export function replaceCachedModule(
  courseId: string,
  moduleId: string,
  module: CourseModule,
): void {
  const id = key(courseId, moduleId);
  const current = resolved.get(id);
  if (!current) {
    return;
  }
  publish(id, { ...current, module });
}

export function rememberLesson(courseId: string, moduleId: string, lesson: Lesson): void {
  addLesson(key(courseId, moduleId), lesson);
}

/** Apply a course status read to the open module. Returns lessons that just became readable. */
export function patchModuleFromStatus(
  courseId: string,
  moduleId: string,
  status: CourseStatus,
): { becameApproved: string[]; becamePublished: boolean } | null {
  const id = key(courseId, moduleId);
  const current = resolved.get(id);
  const statusModule = status.modules.find((item) => item.id === moduleId);
  if (!current || !statusModule) {
    return null;
  }
  const becameApproved: string[] = [];
  let lessonChanged = false;
  const lessons = current.module.lessons.map((lesson) => {
    const next = statusModule.lessons.find((item) => item.id === lesson.id);
    if (!next || next.state === lesson.state) {
      return lesson;
    }
    // A slower read must not close a lesson this visit already showed as approved.
    if (lesson.state === "approved" && next.state !== "failed") {
      return lesson;
    }
    lessonChanged = true;
    if (next.state === "approved") {
      becameApproved.push(lesson.id);
    }
    return { ...lesson, state: next.state };
  });
  const becamePublished =
    statusModule.state === "published" && current.module.state !== "published";
  const courseChanged =
    current.course.state !== status.state ||
    current.course.current_activity !== status.current_activity;
  if (!lessonChanged && !becamePublished && current.module.state === statusModule.state && !courseChanged) {
    return { becameApproved, becamePublished };
  }
  const nextModule = {
    ...current.module,
    state: statusModule.state,
    lessons,
  };
  const course = {
    ...current.course,
    state: status.state,
    current_activity: status.current_activity,
    modules: current.course.modules.map((item) => {
      const next = status.modules.find((row) => row.id === item.id);
      if (!next) {
        return item;
      }
      return {
        ...item,
        state: next.state,
        lessons: item.lessons.map((lesson) => {
          const row = next.lessons.find((candidate) => candidate.id === lesson.id);
          if (!row || row.state === lesson.state) {
            return lesson;
          }
          if (lesson.state === "approved" && row.state !== "failed") {
            return lesson;
          }
          return { ...lesson, state: row.state };
        }),
      };
    }),
  };
  rememberCourseOutline(course);
  publish(id, { ...current, course, module: nextModule });
  return { becameApproved, becamePublished };
}
