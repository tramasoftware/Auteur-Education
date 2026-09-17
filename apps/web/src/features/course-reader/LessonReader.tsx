"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorNotice } from "@/components/ui";
import { courses } from "@/lib/api";
import type { Lesson } from "@/types/generator";

import { Prose } from "./Prose";
import { SourcesList } from "./SourcesList";

type LessonReaderProps = { courseId: string; moduleId: string; lessonId: string };

/** UF-07 reading mode. Audio is out of demo scope. */
export function LessonReader({ courseId, moduleId, lessonId }: LessonReaderProps) {
  const [loaded, setLoaded] = useState<Lesson | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    courses.getLesson(courseId, moduleId, lessonId).then(setLoaded).catch(setError);
  }, [courseId, moduleId, lessonId]);

  // Navigating between lessons keeps the stale record until the new one arrives.
  const lesson = loaded && loaded.id === lessonId ? loaded : null;

  if (!lesson) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">Loading…</p>
        <ErrorNotice error={error} />
      </div>
    );
  }

  const moduleHref = `/courses/${courseId}/modules/${moduleId}`;

  return (
    <article className="flex flex-col gap-8">
      <Link
        href={moduleHref}
        className="text-sm text-zinc-500 underline-offset-4 hover:underline"
      >
        ← Module
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-zinc-500">Lesson {lesson.index}</p>
        <h2 className="text-2xl font-semibold tracking-tight">{lesson.title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{lesson.purpose}</p>
        <p className="text-xs text-zinc-500">~{lesson.word_count} words</p>
      </header>

      <div className="flex flex-col gap-8">
        {lesson.sections.map((section, i) => (
          <section key={i} className="flex flex-col gap-3">
            {section.heading ? (
              <h3 className="text-lg font-semibold">{section.heading}</h3>
            ) : null}
            <Prose text={section.body} />
          </section>
        ))}
      </div>

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h3 className="text-lg font-semibold">Sources</h3>
        <SourcesList sources={lesson.sources} />
      </section>

      <nav className="flex flex-wrap justify-between gap-3 text-sm">
        {lesson.previous_lesson_id ? (
          <Link
            href={`${moduleHref}/lessons/${lesson.previous_lesson_id}`}
            className="underline-offset-4 hover:underline"
          >
            ← Previous lesson
          </Link>
        ) : (
          <span />
        )}
        {lesson.next_lesson_id ? (
          <Link
            href={`${moduleHref}/lessons/${lesson.next_lesson_id}`}
            className="underline-offset-4 hover:underline"
          >
            Next lesson →
          </Link>
        ) : (
          <Link href={moduleHref} className="underline-offset-4 hover:underline">
            Module synthesis and Knowledge Check →
          </Link>
        )}
      </nav>
    </article>
  );
}
