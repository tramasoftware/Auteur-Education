"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorNotice, outlineButtonClass } from "@/components/ui";
import { courses } from "@/lib/api";
import type { CourseModule } from "@/types/generator";

import { Prose } from "./Prose";

type ModuleSynthesisViewProps = { courseId: string; moduleId: string };

export function ModuleSynthesisView({ courseId, moduleId }: ModuleSynthesisViewProps) {
  const [module, setModule] = useState<CourseModule | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    courses.getModule(courseId, moduleId).then(setModule).catch(setError);
  }, [courseId, moduleId]);

  if (!module) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Loading…</p>
        <ErrorNotice error={error} />
        <Link href={`/courses/${courseId}`} className={outlineButtonClass}>
          Back to the course
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/courses/${courseId}`} className={outlineButtonClass}>
        ← Course overview
      </Link>
      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">
          Module {module.index}: {module.title}
        </h2>
        <h3 className="text-lg font-semibold">Module synthesis</h3>
        {module.synthesis ? (
          <Prose text={module.synthesis} />
        ) : (
          <p className="text-sm text-muted">This module does not have a synthesis yet.</p>
        )}
      </section>
    </div>
  );
}
