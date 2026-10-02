"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorNotice, outlineButtonClass } from "@/components/ui";
import { courses } from "@/lib/api";
import type { Lesson } from "@/types/generator";

import { Prose } from "./Prose";
import { SourcesList } from "./SourcesList";

const lessonNavLinkClass = "underline-offset-4 hover:underline";

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
        <p className="text-sm text-muted">Loading…</p>
        <ErrorNotice error={error} />
      </div>
    );
  }

  const moduleHref = `/courses/${courseId}/modules/${moduleId}`;

  return (
    <article className="flex flex-col gap-8">
      <Link href={moduleHref} className={outlineButtonClass}>
        ← Back to module
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted">Lesson {lesson.index}</p>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">{lesson.title}</h2>
        <p className="text-sm text-muted">{lesson.purpose}</p>
        <p className="text-xs text-muted">~{lesson.word_count} words</p>
      </header>

      <div className="flex flex-col gap-5">
        {lesson.sections.map((section, i) => {
          const heading = section.heading.trim();
          return (
            <section
              key={i}
              className={heading ? "mt-4 flex flex-col gap-3" : undefined}
            >
              {heading ? (
                <h3 className="font-serif text-lg font-semibold">{heading}</h3>
              ) : null}
              <Prose text={section.body} />
            </section>
          );
        })}
      </div>

      <section className="flex flex-col gap-3 border-t border-line pt-6">
        <h3 className="text-lg font-semibold">Sources</h3>
        <SourcesList sources={lesson.sources} />
      </section>

      <nav className="flex flex-wrap justify-between gap-3 text-sm">
        {lesson.previous_lesson_id ? (
          <Link
            href={`${moduleHref}/lessons/${lesson.previous_lesson_id}`}
            className={lessonNavLinkClass}
          >
            ← Previous lesson
          </Link>
        ) : (
          <span />
        )}
        {lesson.next_lesson_id ? (
          <Link
            href={`${moduleHref}/lessons/${lesson.next_lesson_id}`}
            className={lessonNavLinkClass}
          >
            Next lesson →
          </Link>
        ) : (
          <Link href={moduleHref} className={lessonNavLinkClass}>
            Module synthesis and Knowledge Check →
          </Link>
        )}
      </nav>
    </article>
  );
}
