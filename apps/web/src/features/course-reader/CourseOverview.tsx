"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  ArrowRightIcon,
  Button,
  ErrorNotice,
  Notice,
  outlineButtonClass,
  RetryIcon,
  StatusBadge,
} from "@/components/ui";
import { courses } from "@/lib/api";
import { courseStateLabel, moduleStateLabel } from "@/lib/labels";
import { usePolling } from "@/lib/usePolling";
import type { Course, ModuleState } from "@/types/generator";

import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { Prose } from "./Prose";

const BUILDING: Course["state"][] = [
  "queued",
  "researching",
  "writing",
  "reviewing",
];

const COURSE_PAGE_PLACEHOLDER_TITLE = "Course";
const COURSE_PAGE_PLACEHOLDER_DESCRIPTION =
  "Modules are published one at a time once they pass review. The state shown is the real state of the build.";

function BuildingDots() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = window.setInterval(() => {
      setCount((current) => (current + 1) % 4);
    }, 450);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span aria-hidden className="inline-block w-[1.5ch] text-left">
      {".".repeat(count)}
    </span>
  );
}

function BuildingHeading() {
  return (
    <p className="flex items-center gap-2 font-medium">
      <span
        aria-hidden
        className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-foreground motion-reduce:animate-none"
      />
      <span>
        Building
        <BuildingDots />
        <span className="sr-only">. In progress.</span>
      </span>
    </p>
  );
}

function failureForLearner(failure: string): string {
  const internal =
    /AI-STG-\d|lesson:[0-9a-f-]{8,}|round\d+|after the allowed attempts/i.test(
      failure,
    );
  if (!internal) {
    return failure;
  }
  return "We stopped before this part was ready to read. Modules that were already published are still available.";
}

function moduleTone(state: ModuleState) {
  switch (state) {
    case "published":
      return "success";
    case "failed":
      return "danger";
    case "researching":
    case "writing":
    case "reviewing":
      return "active";
    default:
      return "neutral";
  }
}

/** UF-06: real build states, progressive publication, final synthesis. */
export function CourseOverview({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(
    () =>
      courses.get(courseId).then(
        (next) => {
          setCourse(next);
          setError(null);
        },
        (err: unknown) => setError(err),
      ),
    [courseId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const building =
    !!course &&
    (BUILDING.includes(course.state) ||
      (course.state === "partially_available" &&
        course.modules.some((m) =>
          ["queued", "researching", "writing", "reviewing"].includes(m.state),
        )));

  usePolling(load, building, 5000);

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      setCourse(await courses.retry(courseId));
    } catch (err: unknown) {
      setError(err);
    } finally {
      setRetrying(false);
    }
  }

  if (!course) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">
          {COURSE_PAGE_PLACEHOLDER_TITLE}
        </h1>
        <p className="text-muted">{COURSE_PAGE_PLACEHOLDER_DESCRIPTION}</p>
        <p className="text-sm text-muted">Loading…</p>
        <ErrorNotice error={error} />
      </div>
    );
  }

  const stateTone =
    course.state === "complete"
      ? "success"
      : course.state === "failed"
        ? "danger"
        : building
          ? "active"
          : "neutral";

  const visibleModules =
    course.state === "failed"
      ? course.modules.filter((module) => module.state === "published")
      : course.modules;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={courseStateLabel[course.state]} tone={stateTone} />
          <span className="text-sm text-muted">
            Blueprint v{course.blueprint_version}
          </span>
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">{course.title}</h1>
        <p className="text-lg text-muted">{course.subtitle}</p>
        <p className="text-sm leading-6">{course.objective_statement}</p>
      </section>

      {course.current_activity ? (
        <Notice tone="info" title={building ? undefined : "Status"}>
          {building ? <BuildingHeading /> : null}
          {course.current_activity}
          {building ? " This page updates automatically." : ""}
        </Notice>
      ) : building ? (
        <Notice tone="info">
          <BuildingHeading />
          Modules are published one at a time once they pass review. You can read a
          published module while the rest is generated.
        </Notice>
      ) : null}

      {course.state === "failed" && course.failure ? (
        <Notice tone="error" title="This part of the course could not be finished">
          <p>{failureForLearner(course.failure)}</p>
          <Button type="button" className="mt-3 gap-2" busy={retrying} onClick={retry}>
            <RetryIcon />
            Retry this course
          </Button>
        </Notice>
      ) : null}

      <ErrorNotice error={error} />

      {visibleModules.length > 0 ? (
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Modules</h3>
        <ol className="flex flex-col gap-3">
          {visibleModules.map((module) => (
            <li
              key={module.id}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h4 className="font-semibold">
                    {module.index}. {module.title}
                  </h4>
                  <p className="text-sm text-muted">
                    {module.function}
                  </p>
                  <p className="text-xs text-muted">
                    {module.lesson_count} lessons
                  </p>
                </div>
                <StatusBadge
                  label={moduleStateLabel[module.state]}
                  tone={moduleTone(module.state)}
                />
              </div>
              {module.state === "published" ? (
                <Link
                  href={`/courses/${course.id}/modules/${module.id}`}
                  className={`${outlineButtonClass} gap-2`}
                >
                  Read this module
                  <ArrowRightIcon />
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      ) : null}

      {course.final_synthesis ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold">Final synthesis</h3>
          <Prose text={course.final_synthesis.body} />
          {course.final_synthesis.new_questions.length > 0 ? (
            <div className="flex flex-col gap-1">
              <h4 className="text-sm font-medium">Questions to keep thinking about</h4>
              <ul className="list-disc pl-5 text-sm leading-6">
                {course.final_synthesis.new_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <DiagnosticsPanel courseId={course.id} refreshKey={course.state + course.current_activity} />
    </div>
  );
}
