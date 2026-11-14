"use client";

import { courses } from "@/lib/api";
import type { Course, CourseModule, CourseProgress, Lesson } from "@/types/generator";

export type ModuleReading = {
  course: Course;
  module: CourseModule;
  lessons: Map<string, Lesson>;
  progress: CourseProgress;
};

const pending = new Map<string, Promise<ModuleReading>>();
const resolved = new Map<string, ModuleReading>();
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

export function loadModuleReading(
  courseId: string,
  moduleId: string,
  options?: { preferLessonId?: string },
): Promise<ModuleReading> {
  const id = key(courseId, moduleId);
  const preferLessonId = options?.preferLessonId;
  const ready = resolved.get(id);
  if (ready && (!preferLessonId || ready.lessons.has(preferLessonId))) {
    return Promise.resolve(ready);
  }
  if (ready && preferLessonId) {
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
      if (pack.lessons.has(preferLessonId) || resolved.get(id)?.lessons.has(preferLessonId)) {
        return resolved.get(id) ?? pack;
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
    const preferred =
      preferLessonId && module.lessons.some((lesson) => lesson.id === preferLessonId)
        ? preferLessonId
        : module.lessons[0]?.id;
    const pack: ModuleReading = { course, module, lessons: new Map(), progress };
    publish(id, pack);
    const restIds = module.lessons
      .map((lesson) => lesson.id)
      .filter((lessonId) => lessonId !== preferred);
    const waitForPreferred = Boolean(preferLessonId && preferred === preferLessonId);
    if (waitForPreferred && preferred) {
      const first = await courses.getLesson(courseId, moduleId, preferred);
      const withLesson = addLesson(id, first) ?? pack;
      prefetchLessonBodies(courseId, moduleId, restIds);
      return withLesson;
    }
    prefetchLessonBodies(courseId, moduleId, preferred ? [preferred, ...restIds] : restIds);
    return resolved.get(id) ?? pack;
  })().finally(() => {
    pending.delete(id);
  });
  pending.set(id, promise);
  return promise;
}

/** Prefetch the first published module and the lesson the reader is about to open. */
export function warmCourseReading(course: Course): Promise<void> {
  rememberCourseOutline(course);
  const first = course.modules.find((module) => module.state === "published");
  if (!first || peekModuleReading(course.id, first.id)) {
    return Promise.resolve();
  }
  return loadModuleReading(course.id, first.id, {
    preferLessonId: first.lessons[0]?.id,
  }).then(() => undefined);
}
