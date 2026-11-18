"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ErrorNotice } from "@/components/ui";
import { courses } from "@/lib/api";
import {
  continueLabel,
  learnerActivity,
  lessonStatusLabel,
  lessonStepLabel,
  moduleClosureLabel,
  resumeHref,
} from "@/lib/course-progress";
import { useCourseBuildWatch } from "@/lib/useCourseBuildWatch";
import type {
  Course,
  CourseProgress,
  CourseStatus,
  LearningStatus,
  ModuleState,
  ModuleSummary,
} from "@/types/generator";

function courseStillBuilding(status: CourseStatus): boolean {
  if (status.state === "complete" || status.state === "failed") {
    return false;
  }
  return status.modules.some(
    (module) =>
      module.state !== "published" &&
      module.state !== "not_built" &&
      module.state !== "failed",
  );
}

import { CourseOutlineScreen } from "./CourseOutlineScreen";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import {
  afterReadingWrites,
  loadCourseProgress,
  peekCourseOutline,
  peekCourseProgress,
  rememberCourseOutline,
  rememberCourseProgress,
  warmCourseReading,
} from "./module-reading-cache";
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

function statusNeedsFullCourse(course: Course, status: CourseStatus): boolean {
  if (status.modules.length !== course.modules.length) {
    return true;
  }
  if (
    (status.state === "complete" && course.state !== "complete") ||
    (status.state === "failed" && course.state !== "failed") ||
    (status.state === "complete" && !course.final_synthesis)
  ) {
    return true;
  }
  return status.modules.some((module) => {
    const current = course.modules.find((item) => item.id === module.id);
    if (!current || (module.state === "published" && current.state !== "published")) {
      return true;
    }
    return module.lessons.some((lesson) => {
      const known = current.lessons.find((item) => item.id === lesson.id);
      return lesson.state === "approved" && known?.state !== "approved";
    });
  });
}

function statusMatches(course: Course, status: CourseStatus): boolean {
  if (course.state !== status.state || course.current_activity !== status.current_activity) {
    return false;
  }
  return status.modules.every((module) => {
    const current = course.modules.find((item) => item.id === module.id);
    if (!current || current.state !== module.state) {
      return false;
    }
    return module.lessons.every((lesson) => {
      const known = current.lessons.find((item) => item.id === lesson.id);
      return known?.state === lesson.state;
    });
  });
}

function patchCourseStatus(course: Course, status: CourseStatus): Course {
  return {
    ...course,
    state: status.state,
    current_activity: status.current_activity,
    modules: course.modules.map((module) => {
      const next = status.modules.find((item) => item.id === module.id);
      if (!next) {
        return module;
      }
      return {
        ...module,
        state: next.state,
        lessons: module.lessons.map((lesson) => {
          const row = next.lessons.find((item) => item.id === lesson.id);
          return row && row.state !== lesson.state ? { ...lesson, state: row.state } : lesson;
        }),
      };
    }),
  };
}

function outlineKey(course: Course): string {
  return [
    course.state,
    course.current_activity ?? "",
    course.failure ?? "",
    course.final_synthesis?.body ?? "",
    course.modules
      .map((module) =>
        [
          module.id,
          module.state,
          module.published_at ?? "",
          module.lesson_count,
          module.has_synthesis ? "1" : "0",
          module.source_count,
          module.question_count ?? "",
          module.lessons.map((lesson) => `${lesson.id}:${lesson.state}:${lesson.word_count}`).join(","),
        ].join("|"),
      )
      .join(";"),
  ].join("#");
}

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

function moduleStatusClass(state: ModuleState, learning: LearningStatus | null): string {
  if (state === "published" && learning === "completed") {
    return "is-completed";
  }
  switch (state) {
    case "published":
      return "is-ready";
    case "writing":
      return "is-writing";
    case "researching":
    case "reviewing":
      return "is-preparing";
    case "queued":
      return "is-queued";
    case "failed":
      return "is-failed";
    case "not_built":
      return "is-limited";
  }
}

function moduleStatusLabel(state: ModuleState, learning: LearningStatus | null): string {
  if (state === "published" && learning === "completed") {
    return "Completed";
  }
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
    return (
      learnerActivity(course.current_activity) ??
      (inProgress.state === "writing"
        ? `Writing module ${pad(inProgress.index)}`
        : `Preparing module ${pad(inProgress.index)}`)
    );
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

/** Immediate outline while retry is still waiting on the API. */
function asQueuedRetry(current: Course): Course {
  return {
    ...current,
    state: "queued",
    failure: null,
    current_activity: null,
    modules: current.modules.map((module) =>
      module.state === "failed"
        ? {
            ...module,
            state: "queued",
            lessons: module.lessons.map((lesson) =>
              lesson.state === "approved" ? lesson : { ...lesson, state: "queued" },
            ),
          }
        : module,
    ),
  };
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

function cifraLine(course: Course, progress: CourseProgress | null): string {
  const moduleCount = course.modules.length;
  const lessonCount = course.modules.reduce(
    (sum, module) => sum + module.lesson_count,
    0,
  );
  const published = course.modules.every((module) => module.state === "published");
  const words = course.modules.reduce(
    (sum, module) =>
      module.state === "published"
        ? sum + module.lessons.reduce((inner, lesson) => inner + lesson.word_count, 0)
        : sum,
    0,
  );
  const parts = [
    `${moduleCount} module${moduleCount === 1 ? "" : "s"}`,
    `${lessonCount} lesson${lessonCount === 1 ? "" : "s"}`,
  ];
  if (progress && progress.lesson_total > 0) {
    parts.push(`${progress.lessons_read} of ${progress.lesson_total} read`);
  }
  if (published && words > 0) {
    parts.push(`${readingMinutes(words)} min estimated reading`);
  }
  return parts.join(" · ");
}

function pieNote(course: Course, building: boolean): string | null {
  if (building) {
    const step = learnerActivity(course.current_activity);
    if (step) {
      return step;
    }
  }
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
    return (
      learnerActivity(course.current_activity) ??
      "Each finished lesson can be read while the rest of its module is still being written. The next module starts when this one is published."
    );
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

function PendingExtras({
  synthesis = "Not available yet",
  quiz = "Not available yet",
}: {
  synthesis?: string;
  quiz?: string;
}) {
  const rows = [
    ["Module synthesis", synthesis],
    ["Sources used in this module", "Not available yet"],
    ["Knowledge Check", quiz],
  ] as const;
  return (
    <>
      {rows.map(([title, note]) => (
        <li className="comp nog" key={title}>
          <span className="fila">
            <span className="k">—</span>
            <span className="t">{title}</span>
            <span className="d">{note}</span>
          </span>
        </li>
      ))}
    </>
  );
}

function ModuleSection({
  courseId,
  module,
  readIds,
  learningStatus,
  activity,
}: {
  courseId: string;
  module: ModuleSummary;
  readIds: ReadonlySet<string>;
  learningStatus: LearningStatus | null;
  activity: string | null;
}) {
  const live = ["writing", "researching", "reviewing"].includes(module.state);
  const loading = live || module.state === "queued" || module.state === "not_built";
  const ready = module.state === "published";
  const assembling = loading && module.state !== "not_built";
  return (
    <section className="cur-mod">
      {assembling ? (
        <p className="mod-build">
          <span className="spin" aria-hidden="true" />
          <span>
            Assembling module {pad(module.index)} ·{" "}
            {(activity?.startsWith(`Module ${module.index}:`)
              ? learnerActivity(activity)
              : null) ?? moduleStatusLabel(module.state, null)}
          </span>
        </p>
      ) : null}
      <span className="n">{pad(module.index)}</span>
      <div>
        <h2>
          {module.title}
          <span className={`est-m ${moduleStatusClass(module.state, learningStatus)}`}>
            {moduleStatusLabel(module.state, learningStatus)}
            {module.state === "published" && learningStatus === "completed" ? (
              <svg className="est-tick" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M2.2 6.3 4.7 8.8 9.8 3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="square"
                />
              </svg>
            ) : null}
          </span>
        </h2>
        <AboutModule
          outcome={module.outcome}
          questions={module.guiding_questions}
          text={module.function}
        />
        <ol className="ren">
          {module.lessons.length > 0 ? (
            <>
              {module.lessons.map((lesson) => {
                const readable = lesson.state === "approved";
                const label =
                  lessonStepLabel(activity, lesson.index) ??
                  (readable
                    ? readIds.has(lesson.id)
                      ? "Read"
                      : lesson.word_count > 0
                        ? `${readingMinutes(lesson.word_count)} min`
                        : "Ready"
                    : lessonStatusLabel(lesson.state));
                const generating = ["researching", "writing", "reviewing"].includes(lesson.state);
                return (
                  <li key={lesson.id} className={readable ? undefined : "nog"}>
                    {readable ? (
                      <Link
                        href={`/courses/${courseId}/modules/${module.id}/lessons/${lesson.id}`}
                      >
                        <span className="k">{pad(lesson.index)}</span>
                        <span className="t">{lesson.title}</span>
                        <span className="d">{label}</span>
                      </Link>
                    ) : (
                      <span className="fila">
                        {generating ? <span className="spin" aria-hidden="true" /> : null}
                        <span className="k">{pad(lesson.index)}</span>
                        <span className="t">{lesson.title}</span>
                        <span className="d">{label}</span>
                      </span>
                    )}
                  </li>
                );
              })}
              {ready ? (
                <>
                  {module.has_synthesis ? (
                    <OutlineExtraLink
                      href={`/courses/${courseId}/modules/${module.id}/synthesis`}
                      title="Module synthesis"
                    />
                  ) : null}
                  <OutlineExtraLink
                    href={`/courses/${courseId}/modules/${module.id}/sources`}
                    meta={
                      module.source_count === 1
                        ? "1 source"
                        : `${module.source_count} sources`
                    }
                    title="Sources used in this module"
                  />
                  {module.question_count !== null ? (
                    <OutlineExtraLink
                      href={`/courses/${courseId}/modules/${module.id}/knowledge-check`}
                      meta={`${module.question_count} questions`}
                      title="Knowledge Check"
                    />
                  ) : null}
                </>
              ) : (
                <PendingExtras
                  synthesis={moduleClosureLabel(module, activity, "synthesis")}
                  quiz={moduleClosureLabel(module, activity, "quiz")}
                />
              )}
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
  const [course, setCourse] = useState<Course | null>(() => peekCourseOutline(courseId));
  const [progress, setProgress] = useState<CourseProgress | null>(() =>
    peekCourseProgress(courseId),
  );
  const [error, setError] = useState<unknown>(null);
  const [shownId, setShownId] = useState(courseId);
  const retryLock = useRef(false);
  if (shownId !== courseId) {
    setShownId(courseId);
    setCourse(peekCourseOutline(courseId));
    setProgress(peekCourseProgress(courseId));
    setError(null);
  }

  const load = useCallback(
    () => {
      if (retryLock.current) {
        return Promise.resolve();
      }
      const coursePromise = courses.get(courseId).then(
        (next) => {
          if (retryLock.current) {
            return;
          }
          setCourse((prev) => (prev && outlineKey(prev) === outlineKey(next) ? prev : next));
          setError(null);
          void warmCourseReading(next);
        },
        (err: unknown) => setError(err),
      );
      const progressPromise = afterReadingWrites()
        .then(() => {
          if (retryLock.current) {
            return null;
          }
          return loadCourseProgress(courseId).catch(() => null);
        })
        .then((learning) => {
          if (!retryLock.current && learning) {
            setProgress(learning);
          }
        });
      return Promise.all([coursePromise, progressPromise]).then(() => undefined);
    },
    [courseId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const courseRef = useRef(course);
  useEffect(() => {
    courseRef.current = course;
  });

  const building =
    !!course &&
    (BUILDING.includes(course.state) ||
      (course.state === "partially_available" &&
        course.modules.some((module) => IN_PROGRESS.includes(module.state))));

  const applyStatus = useCallback(
    (status: CourseStatus) => {
      const current = courseRef.current;
      if (retryLock.current || !current) {
        return;
      }
      if (statusNeedsFullCourse(current, status)) {
        return load();
      }
      if (statusMatches(current, status)) {
        return;
      }
      const patched = patchCourseStatus(current, status);
      rememberCourseOutline(patched);
      setCourse(patched);
    },
    [load],
  );

  useCourseBuildWatch(courseId, building, applyStatus, courseStillBuilding);

  async function retry() {
    const snapshot = course;
    retryLock.current = true;
    setError(null);
    if (snapshot) {
      setCourse(asQueuedRetry(snapshot));
    }
    try {
      const next = await courses.retry(courseId);
      const learning = await courses.progress(next.id).catch(() => null);
      retryLock.current = false;
      setCourse(next);
      if (learning) {
        rememberCourseProgress(next.id, learning);
        setProgress(learning);
      }
      void warmCourseReading(next);
    } catch (err: unknown) {
      retryLock.current = false;
      if (snapshot) {
        setCourse(snapshot);
      }
      setError(err);
    }
  }

  const headerStatus = courseHeaderStatus(course);
  const readIds = useMemo(
    () =>
      new Set(
        progress?.lessons.filter((lesson) => lesson.read).map((lesson) => lesson.lesson_id) ??
          [],
      ),
    [progress],
  );
  const startTarget = (() => {
    if (!course) {
      return null;
    }
    for (const section of course.modules) {
      const lesson = section.lessons.find((item) => item.state === "approved");
      if (lesson) {
        return { module: section, lesson };
      }
    }
    return null;
  })();
  const startHref = startTarget
    ? `/courses/${courseId}/modules/${startTarget.module.id}/lessons/${startTarget.lesson.id}`
    : null;
  const actionHref =
    progress && (progress.synthesis_auto_open_pending || progress.resume_lesson_id)
      ? resumeHref(courseId, progress)
      : startHref;
  const actionLabel = progress
    ? continueLabel(progress)
    : startTarget
      ? "Start reading"
      : null;
  const note = course ? pieNote(course, building) : null;
  const courseFailed = course?.state === "failed";
  const presentedSynthesis = useRef(false);

  useEffect(() => {
    if (
      !course?.final_synthesis ||
      !progress?.synthesis_auto_open_pending ||
      presentedSynthesis.current
    ) {
      return;
    }
    const node = document.getElementById("final-synthesis");
    if (!node) {
      return;
    }
    presentedSynthesis.current = true;
    node.scrollIntoView({ block: "start" });
    courses.presentSynthesis(course.id).catch(() => undefined);
  }, [course, progress]);

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
                <span className="est-m is-preparing">Preparing…</span>
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
            <p className="cifras">{cifraLine(course, progress)}</p>
          </header>

          {courseFailed && course.failure ? (
            <div className="aviso err">
              <p>{failureForLearner(course.failure)}</p>
              <button className="btn" type="button" onClick={retry}>
                Retry this course
                <span className="ar" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {course.modules.map((module) => (
            <ModuleSection
              courseId={course.id}
              key={module.id}
              learningStatus={
                progress?.modules.find((item) => item.module_id === module.id)
                  ?.learning_status ?? null
              }
              module={module}
              activity={course.current_activity}
              readIds={readIds}
            />
          ))}

          {course.final_synthesis ? (
            <section className="sintesis" id="final-synthesis">
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

          {(actionHref && actionLabel) || note ? (
            <div className="pie-c">
              {actionHref && actionLabel ? (
                courseFailed || !actionHref ? (
                  <button className="btn" disabled type="button">
                    {actionLabel}
                    <span className="ar" aria-hidden="true" />
                  </button>
                ) : (
                  <Link className="btn" href={actionHref}>
                    {actionLabel}
                    <span className="ar" aria-hidden="true" />
                  </Link>
                )
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
