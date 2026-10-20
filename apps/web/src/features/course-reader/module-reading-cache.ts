"use client";

import { courses } from "@/lib/api";
import type { Course, CourseModule, Lesson } from "@/types/generator";

export type ModuleReading = {
  course: Course;
  module: CourseModule;
  lessons: Map<string, Lesson>;
};

const pending = new Map<string, Promise<ModuleReading>>();
const resolved = new Map<string, ModuleReading>();

function key(courseId: string, moduleId: string): string {
  return `${courseId}:${moduleId}`;
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
    const [course, module] = await Promise.all([
      courses.get(courseId),
      courses.getModule(courseId, moduleId),
    ]);
    const lessons = await Promise.all(
      module.lessons.map((lesson) => courses.getLesson(courseId, moduleId, lesson.id)),
    );
    const pack: ModuleReading = {
      course,
      module,
      lessons: new Map(lessons.map((lesson) => [lesson.id, lesson])),
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
