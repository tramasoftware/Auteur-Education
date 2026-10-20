"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorNotice } from "@/components/ui";
import { courses } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import type { Course, CourseModule, ModuleState, ModuleSummary } from "@/types/generator";

import { CourseOutlineScreen } from "./CourseOutlineScreen";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { warmCourseReading } from "./module-reading-cache";
import { Prose } from "./Prose";

const BUILDING: Course["state"][] = [
  "queued",
  "researching",
  "writing",
  "reviewing",
];

const IN_PROGRESS: ModuleState[] = [
  "queued",
  "researching",
  "writing",
  "reviewing",
];

const SKELETON_WIDTHS = [
  [22, 34],
  [16, 28],
  [19, 31],
] as const;

const WORDS_PER_MINUTE = 180;

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

function moduleStatusLabel(state: ModuleState): string {
  switch (state) {
    case "published":
      return "Ready to read";
    case "writing":
      return "Writing…";
    case "researching":
    case "reviewing":
      return "Preparing…";
    case "queued":
      return "Queued";
    case "failed":
      return "Could not be finished";
    case "not_built":
      return "Not built (demo limit)";
  }
}

function courseHeaderStatus(course: Course | null): string {
  if (!course) {
    return "Your course";
  }
  const inProgress = course.modules.find((module) =>
    IN_PROGRESS.includes(module.state),
  );
  if (inProgress) {
    return inProgress.state === "writing"
      ? `Writing module ${pad(inProgress.index)}`
      : `Preparing module ${pad(inProgress.index)}`;
  }
  if (course.current_activity === "Writing final synthesis") {
    return "Writing final synthesis";
  }
  if (course.current_activity === "Auditing course") {
    return "Reviewing";
  }
  if (course.state === "complete") {
    const lessons = course.modules.reduce((sum, module) => sum + module.lesson_count, 0);
    return `${lessons} lessons`;
  }
  if (course.state === "failed") {
    return "Could not be finished";
  }
  return "Your course";
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

function cifraLine(course: Course, details: Record<string, CourseModule>): string {
  const moduleCount = course.modules.length;
  const lessonCount = course.modules.reduce(
    (sum, module) => sum + module.lesson_count,
    0,
  );
  const published = course.modules.every((module) => module.state === "published");
  const words = Object.values(details).reduce(
    (sum, module) =>
      sum + module.lessons.reduce((inner, lesson) => inner + lesson.word_count, 0),
    0,
  );
  const parts = [
    `${moduleCount} module${moduleCount === 1 ? "" : "s"}`,
    `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}`,
  ];
  if (published && words > 0) {
    parts.push(`${readingMinutes(words)} min estimated reading`);
  }
  return parts.join(" · ");
}

function pieNote(course: Course, building: boolean): string | null {
  const readable = course.modules.find((module) => module.state === "published");
  const writing = course.modules.find((module) =>
    ["writing", "researching", "reviewing"].includes(module.state),
  );
  const queued = course.modules.find((module) => module.state === "queued");
  if (readable && writing) {
    const next = queued
      ? ` Module ${pad(queued.index)} is next in line; we’ll let you know when they’re ready.`
      : "";
    return `Read module ${pad(readable.index)} while ${pad(writing.index)} is being written.${next}`;
  }
  if (building) {
    return "Modules are published one at a time once they pass review. You can read a published module while the rest is generated.";
  }
  if (course.state === "complete") {
    return "Continue at your own pace.";
  }
  return course.current_activity;
}

function SkeletonRows({
  count,
  live,
}: {
  count: number;
  live: boolean;
}) {
  const rows = Math.max(count, 1);
  return (
    <>
      {Array.from({ length: rows }, (_, index) => {
        const widths = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
        return (
          <li className={`esq${live ? " vivo" : ""}`} key={index}>
            <span className="fila">
              <span className="k">{pad(index + 1)}</span>
              <span className="t">
                <span className="bar" style={{ width: `${widths[0]}ch` }} />
                <span className="bar" style={{ width: `${widths[1]}ch` }} />
              </span>
            </span>
          </li>
        );
      })}
    </>
  );
}

function AboutModule({
  text,
  questions,
  outcome,
}: {
  text: string;
  questions: string[];
  outcome: string;
}) {
  if (!text && questions.length === 0 && !outcome) {
    return null;
  }
  return (
    <details className="module-detail">
      <summary>About this module</summary>
      {text ? <p>{text}</p> : null}
      {questions.length > 0 ? (
        <>
          <h3>Guiding questions</h3>
          <ul>
            {questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      ) : null}
      {outcome ? (
        <>
          <h3>Outcome</h3>
          <p>{outcome}</p>
        </>
      ) : null}
    </details>
  );
}

function OutlineExtraLink({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta?: string;
}) {
  return (
    <li className="comp">
      <Link href={href}>
        <span className="k">—</span>
        <span className="t">{title}</span>
        {meta ? <span className="d">{meta}</span> : null}
      </Link>
    </li>
  );
}

function PendingExtras() {
  return (
    <>
      {["Module synthesis", "Sources used in this module", "Knowledge Check"].map(
        (title) => (
          <li className="comp nog" key={title}>
            <span className="fila">
              <span className="k">—</span>
              <span className="t">{title}</span>
            </span>
          </li>
        ),
      )}
    </>
  );
}

function ModuleSection({
  courseId,
  module,
  detail,
}: {
  courseId: string;
  module: ModuleSummary;
  detail: CourseModule | undefined;
}) {
  const live = ["writing", "researching", "reviewing"].includes(module.state);
  const loading = live || module.state === "queued" || module.state === "not_built";
  const ready = module.state === "published";
  return (
    <section className="cur-mod">
      <span className="n">{pad(module.index)}</span>
      <div>
        <h2>
          {module.title}
          <span className="est-m">{moduleStatusLabel(module.state)}</span>
        </h2>
        <AboutModule
          outcome={module.outcome}
          questions={module.guiding_questions}
          text={module.function}
        />
        <ol className="ren">
          {ready && detail ? (
            <>
              {detail.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link
                    href={`/courses/${courseId}/modules/${module.id}/lessons/${lesson.id}`}
                  >
                    <span className="k">{pad(lesson.index)}</span>
                    <span className="t">{lesson.title}</span>
                    <span className="d">{readingMinutes(lesson.word_count)} min</span>
                  </Link>
                </li>
              ))}
              {detail.synthesis ? (
                <OutlineExtraLink
                  href={`/courses/${courseId}/modules/${module.id}/synthesis`}
                  title="Module synthesis"
                />
              ) : null}
              <OutlineExtraLink
                href={`/courses/${courseId}/modules/${module.id}/sources`}
                meta={
                  detail.sources.length === 1
                    ? "1 source"
                    : `${detail.sources.length} sources`
                }
                title="Sources used in this module"
              />
              {detail.knowledge_check ? (
                <OutlineExtraLink
                  href={`/courses/${courseId}/modules/${module.id}/knowledge-check`}
                  meta={`${detail.knowledge_check.questions.length} questions`}
                  title="Knowledge Check"
                />
              ) : null}
            </>
          ) : loading ? (
            <>
              <SkeletonRows count={module.lesson_count} live={live} />
              <PendingExtras />
            </>
          ) : (
            <li className="nog">
              <span className="fila">
                <span className="k">—</span>
                <span className="t">This module is not ready to read.</span>
              </span>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}

/** UF-06: real build states, progressive publication, final synthesis. */
export function CourseOverview({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [details, setDetails] = useState<Record<string, CourseModule>>({});
  const [error, setError] = useState<unknown>(null);
  const [retrying, setRetrying] = useState(false);

  const loadDetails = useCallback(async (next: Course) => {
    const published = next.modules.filter((module) => module.state === "published");
    if (published.length === 0) {
      setDetails({});
      return;
    }
    const loaded = await Promise.all(
      published.map((module) =>
        courses.getModule(next.id, module.id).catch(() => null),
      ),
    );
    const map: Record<string, CourseModule> = {};
    loaded.forEach((module, index) => {
      if (module) {
        map[published[index].id] = module;
      }
    });
    setDetails(map);
  }, []);

  const load = useCallback(
    () =>
      courses.get(courseId).then(
        async (next) => {
          try {
            await Promise.all([loadDetails(next), warmCourseReading(next)]);
            setCourse(next);
            setError(null);
          } catch (err: unknown) {
            setError(err);
          }
        },
        (err: unknown) => setError(err),
      ),
    [courseId, loadDetails],
  );

  useEffect(() => {
    load();
  }, [load]);

  const building =
    !!course &&
    (BUILDING.includes(course.state) ||
      (course.state === "partially_available" &&
        course.modules.some((module) => IN_PROGRESS.includes(module.state))));

  usePolling(load, building, 5000);

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const next = await courses.retry(courseId);
      await Promise.all([loadDetails(next), warmCourseReading(next)]);
      setCourse(next);
    } catch (err: unknown) {
      setError(err);
    } finally {
      setRetrying(false);
    }
  }

  const headerStatus = courseHeaderStatus(course);
  const startModule = useMemo(
    () => course?.modules.find((module) => module.state === "published") ?? null,
    [course],
  );
  const startHref =
    startModule && details[startModule.id]?.lessons[0]
      ? `/courses/${courseId}/modules/${startModule.id}/lessons/${details[startModule.id].lessons[0].id}`
      : startModule
        ? `/courses/${courseId}/modules/${startModule.id}`
        : null;
  const note = course ? pieNote(course, building) : null;

  return (
    <CourseOutlineScreen title={headerStatus}>
      {!course ? (
        <>
          <header>
            <span className="k">Your course</span>
            <h1>Course</h1>
            <p className="cifras">Loading outline</p>
          </header>
          <section className="cur-mod">
            <span className="n">01</span>
            <div>
              <h2>
                Preparing
                <span className="est-m">Preparing…</span>
              </h2>
              <ol className="ren">
                <SkeletonRows count={3} live />
              </ol>
            </div>
          </section>
          <div className="form-avisos">
            <ErrorNotice error={error} />
          </div>
        </>
      ) : (
        <>
          <header>
            <span className="k">Your course</span>
            <h1>{course.title}</h1>
            {course.subtitle ? <p className="sub">{course.subtitle}</p> : null}
            <p className="cifras">{cifraLine(course, details)}</p>
          </header>

          {course.modules.map((module) => (
            <ModuleSection
              courseId={course.id}
              detail={details[module.id]}
              key={module.id}
              module={module}
            />
          ))}

          {course.state === "failed" && course.failure ? (
            <div className="aviso err">
              <p>{failureForLearner(course.failure)}</p>
              <button className="btn" disabled={retrying} type="button" onClick={retry}>
                Retry this course
                <span className="ar" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {course.final_synthesis ? (
            <section className="sintesis">
              <h2>Final synthesis</h2>
              <Prose text={course.final_synthesis.body} />
              {course.final_synthesis.new_questions.length > 0 ? (
                <>
                  <h3>Questions to keep thinking about</h3>
                  <ul>
                    {course.final_synthesis.new_questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          {startHref || note ? (
            <div className="pie-c">
              {startHref && startModule ? (
                <Link className="btn" href={startHref}>
                  Start module {pad(startModule.index)}
                  <span className="ar" aria-hidden="true" />
                </Link>
              ) : null}
              {note ? <span className="nota">{note}</span> : null}
            </div>
          ) : null}

          <div className="form-avisos">
            <ErrorNotice error={error} />
          </div>

          <DiagnosticsPanel
            courseId={course.id}
            refreshKey={course.state + (course.current_activity ?? "")}
          />
        </>
      )}
    </CourseOutlineScreen>
  );
}
