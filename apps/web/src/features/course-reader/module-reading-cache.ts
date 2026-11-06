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
let pendingWrite: Promise<void> = Promise.resolve();

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
  const promise = courses.progress(courseId).finally(() => {
    progressPending.delete(courseId);
  });
  progressPending.set(courseId, promise);
  return promise;
}

export function replaceModuleProgress(
  courseId: string,
  moduleId: string,
  progress: CourseProgress,
): void {
  const id = key(courseId, moduleId);
  const ready = resolved.get(id);
  if (ready) {
    resolved.set(id, { ...ready, progress });
  }
}

export function peekModuleReading(courseId: string, moduleId: string): ModuleReading | null {
  return resolved.get(key(courseId, moduleId)) ?? null;
}

export function loadModuleReading(courseId: string, moduleId: string): Promise<ModuleReading> {
  const id = key(courseId, moduleId);
  const ready = resolved.get(id);
  if (ready) {
    return Promise.resolve(ready);
  }
  const inflight = pending.get(id);
  if (inflight) {
    return inflight;
  }
  const promise = (async () => {
    const [course, module, progress] = await Promise.all([
      courses.get(courseId),
      courses.getModule(courseId, moduleId),
      loadProgress(courseId),
    ]);
    const lessons = await Promise.all(
      module.lessons.map((lesson) => courses.getLesson(courseId, moduleId, lesson.id)),
    );
    const pack: ModuleReading = {
      course,
      module,
      lessons: new Map(lessons.map((lesson) => [lesson.id, lesson])),
      progress,
    };
    resolved.set(id, pack);
    pending.delete(id);
    return pack;
  })().catch((err: unknown) => {
    pending.delete(id);
    throw err;
  });
  pending.set(id, promise);
  return promise;
}

export function warmCourseReading(course: Course): Promise<void> {
  const published = course.modules.filter((module) => module.state === "published");
  return Promise.all(published.map((module) => loadModuleReading(course.id, module.id))).then(
    () => undefined,
  );
}
