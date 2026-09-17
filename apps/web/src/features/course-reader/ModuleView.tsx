"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BulletList, DefinitionList, ErrorNotice } from "@/components/ui";
import { courses } from "@/lib/api";
import type { CourseModule } from "@/types/generator";

import { KnowledgeCheck } from "./KnowledgeCheck";
import { Prose } from "./Prose";
import { SourcesList } from "./SourcesList";

type ModuleViewProps = { courseId: string; moduleId: string };

/** UF-07: a published module — lessons, synthesis, sources, Knowledge Check. */
export function ModuleView({ courseId, moduleId }: ModuleViewProps) {
  const [module, setModule] = useState<CourseModule | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    courses.getModule(courseId, moduleId).then(setModule).catch(setError);
  }, [courseId, moduleId]);

  if (!module) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">Loading…</p>
        <ErrorNotice error={error} />
        <Link href={`/courses/${courseId}`} className="text-sm underline underline-offset-4">
          Back to the course
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={`/courses/${courseId}`}
        className="text-sm text-zinc-500 underline-offset-4 hover:underline"
      >
        ← Course overview
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          Module {module.index}: {module.title}
        </h2>
        <p className="text-base leading-7">{module.function}</p>
        <DefinitionList
          items={[
            {
              term: "Guiding questions",
              detail: <BulletList items={module.guiding_questions} />,
            },
            { term: "Outcome", detail: module.outcome },
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Lessons</h3>
        <ol className="flex flex-col gap-3">
          {module.lessons.map((lesson) => (
            <li key={lesson.id} className="flex flex-col gap-1">
              <Link
                href={`/courses/${courseId}/modules/${module.id}/lessons/${lesson.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {module.index}.{lesson.index} {lesson.title}
              </Link>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{lesson.purpose}</p>
              <p className="text-xs text-zinc-500">~{lesson.word_count} words</p>
            </li>
          ))}
        </ol>
      </section>

      {module.synthesis ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">Module synthesis</h3>
          <Prose text={module.synthesis} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Sources used in this module</h3>
        <SourcesList sources={module.sources} />
      </section>

      {module.knowledge_check ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">Knowledge Check</h3>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Five questions on the ideas this module developed. Optional and repeatable.
          </p>
          <KnowledgeCheck check={module.knowledge_check} />
        </section>
      ) : null}
    </div>
  );
}
