"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { blueprintJourneyStep, useJourneyStep } from "@/components/layout";
import {
  CheckingGenerationStatus,
  ErrorNotice,
  GenerationStatus,
  Notice,
} from "@/components/ui";
import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";
import { CourseStepLabel } from "@/features/course-setup/CourseStepLabel";
import {
  BLUEPRINT_APPROACH_MS,
  BLUEPRINT_PHASES,
  StagePreparing,
} from "@/features/course-setup/StagePreparing";
import { StageFailure, stageFailureCopy } from "@/features/course-setup/StageFailure";
import { blueprints } from "@/lib/api";
import { blueprintStateLabel } from "@/lib/labels";
import { forgetCourseFlowPath, forgetRequestId, recallRequestId } from "@/lib/session";
import { usePolling } from "@/lib/usePolling";
import { useRedirectIfActiveBuild } from "@/hooks/useRedirectIfActiveBuild";
import type { Blueprint, BlueprintVisible } from "@/types/generator";

import { PreparingCourse, type PreparingSheet } from "./PreparingCourse";
import "./blueprint.css";

function counted(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function studyEstimate(hours: string, words: number) {
  const parts: string[] = [];
  const trimmed = hours.trim();
  if (trimmed) {
    parts.push(/hour/i.test(trimmed) ? trimmed : `${trimmed} hours`);
  }
  if (words > 0) {
    parts.push(`~${words.toLocaleString("en-US")} words`);
  }
  return parts.join(" · ");
}

function sourceHref(value: string) {
  if (!/^https?:\/\//i.test(value)) {
    return null;
  }
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

function sourceLabel(value: string) {
  const href = sourceHref(value);
  if (!href) {
    return value;
  }
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function BlueprintChrome({
  requestId,
  children,
}: {
  requestId?: string | null;
  children: ReactNode;
}) {
  const backHref = requestId ? `/proposals?request=${requestId}` : "/proposals";
  return (
    <CourseSetupFrame
      title="Blueprint"
      backHref={backHref}
      backLabel="Back to directions"
      backAriaLabel="Back to your learning paths"
      mainClassName="bp-main"
      screenClassName="blueprint-screen"
    >
      {children}
    </CourseSetupFrame>
  );
}

const SHEET_LINES = [
  [92, 86, 78, 64],
  [88, 90, 70, 58],
  [84, 92, 76, 40],
  [90, 82, 94, 62],
];

function preparingCopy(blueprint: Blueprint) {
  const visible = blueprint.blueprint;
  const sheets: PreparingSheet[] = [];
  for (const [moduleIndex, module] of (visible?.modules ?? []).entries()) {
    for (const [lessonIndex, lesson] of module.lessons.entries()) {
      if (sheets.length >= 6) {
        break;
      }
      sheets.push({
        label: `Module ${String(moduleIndex + 1).padStart(2, "0")} · Lesson ${lessonIndex + 1}`,
        title: lesson.title,
        lines: SHEET_LINES[sheets.length % SHEET_LINES.length],
      });
    }
    if (sheets.length >= 6) {
      break;
    }
  }
  const moduleCount = visible?.modules.length ?? 1;
  const first = visible?.modules[0];
  return {
    title: visible?.title || "Your course",
    subtitle: visible?.subtitle || "",
    sheets,
    coverKicker: `AUTEUR · MODULE OVERVIEW · 01 / ${String(moduleCount).padStart(2, "0")}`,
    coverLabel: "Module 01",
    coverTitle: first?.title || visible?.title || "Your course",
  };
}

/** UF-04: review the visible Blueprint, request changes, approve the exact version. */
export function BlueprintFeature({ blueprintId }: { blueprintId: string }) {
  const router = useRouter();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [courseFailed, setCourseFailed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [revising, setRevising] = useState(false);
  const [preparingCourseId, setPreparingCourseId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [enteredBlueprint, setEnteredBlueprint] = useState(false);
  const [holdBlueprint, setHoldBlueprint] = useState(false);
  const blockingActiveBuild = useRedirectIfActiveBuild(!preparing);

  useJourneyStep(blueprintJourneyStep(blueprint?.state ?? null));

  const load = useCallback(
    () =>
      blueprints.get(blueprintId).then(
        (next) => {
          setBlueprint(next);
          if (next.state === "generating" && !next.blueprint) {
            setHoldBlueprint(true);
            setEnteredBlueprint(false);
          } else {
            setHoldBlueprint(false);
            if (next.blueprint) {
              setEnteredBlueprint(true);
            }
          }
          setError(null);
        },
        (err: unknown) => setError(err),
      ),
    [blueprintId],
  );

  useEffect(() => {
    load();
  }, [load]);

  usePolling(load, blueprint?.state === "generating");

  const revise = async () => {
    setBusy(true);
    setError(null);
    try {
      setBlueprint(await blueprints.revise(blueprintId, feedback.trim()));
      setFeedback("");
      setRevising(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!blueprint?.current_version) {
      return;
    }
    setBusy(true);
    setError(null);
    setCourseFailed(false);
    try {
      setPreparing(true);
      const result = await blueprints.approve(blueprintId, blueprint.current_version);
      forgetRequestId();
      forgetCourseFlowPath();
      setPreparingCourseId(result.course_id);
      setBusy(false);
    } catch {
      setPreparing(true);
      setCourseFailed(true);
      setBusy(false);
      load();
    }
  };

  if ((preparing || courseFailed) && blueprint) {
    const copy = preparingCopy(blueprint);
    return createPortal(
      <div className="preparing-overlay">
        <CourseSetupFrame
          screenClassName="preparing-screen"
          mainClassName="preparing-main"
          title="Your course"
          backHref={`/blueprints/${blueprintId}`}
          backLabel="Blueprint"
          backAriaLabel="Back to the Blueprint"
        >
          {courseFailed ? (
            <StageFailure
              {...stageFailureCopy.course}
              busy={busy}
              onRetry={() => {
                void approve();
              }}
              onBack={() => {
                setCourseFailed(false);
                setPreparing(false);
                router.push(`/proposals?request=${blueprint.request_id}`);
              }}
            />
          ) : (
            <PreparingCourse
              {...copy}
              courseReady={preparingCourseId !== null}
              courseHref={preparingCourseId ? `/courses/${preparingCourseId}` : null}
            />
          )}
        </CourseSetupFrame>
      </div>,
      document.body,
    );
  }

  if (blockingActiveBuild) {
    return <CheckingGenerationStatus />;
  }

  if (!blueprint) {
    if (error) {
      return (
        <BlueprintChrome>
          <div className="form-avisos">
            <ErrorNotice error={error} />
          </div>
        </BlueprintChrome>
      );
    }
    const resumeRequestId = recallRequestId();
    return (
      <StagePreparing
        frameTitle="Blueprint"
        backHref={resumeRequestId ? `/proposals?request=${resumeRequestId}` : "/proposals"}
        backLabel="Learning paths"
        backAriaLabel="Back to your learning paths"
        heading="Your Blueprint is taking shape"
        readyHeading="Your Blueprint is ready"
        phases={BLUEPRINT_PHASES}
        approachMs={BLUEPRINT_APPROACH_MS}
        crawlMs={30000}
        ready={false}
        onContinue={() => {}}
      />
    );
  }

  if (holdBlueprint && !enteredBlueprint && blueprint.state !== "failed") {
    return (
      <StagePreparing
        frameTitle="Blueprint"
        backHref={`/proposals?request=${blueprint.request_id}`}
        backLabel="Learning paths"
        backAriaLabel="Back to your learning paths"
        heading="Your Blueprint is taking shape"
        readyHeading="Your Blueprint is ready"
        phases={BLUEPRINT_PHASES}
        approachMs={BLUEPRINT_APPROACH_MS}
        crawlMs={30000}
        ready={blueprint.state !== "generating" && blueprint.blueprint !== null}
        onContinue={() => setEnteredBlueprint(true)}
      />
    );
  }

  const v = blueprint.blueprint;

  return (
    <BlueprintChrome requestId={blueprint.request_id}>
      {blueprint.state === "generating" && v ? (
        <div className="bp-notices">
          <GenerationStatus
            title="Rewriting your Blueprint"
            description="Applying your notes to a new version of the pedagogical contract."
          />
        </div>
      ) : null}

      {blueprint.failure_message ? (
        <div className="bp-notices form-avisos">
          <Notice tone="error" title="Generation problem">
            {blueprint.failure_message}
          </Notice>
        </div>
      ) : null}

      {error ? (
        <div className="bp-notices form-avisos">
          <ErrorNotice error={error} />
        </div>
      ) : null}

      {blueprint.state === "failed" ? (
        <p className="bp-notices">
          <Link className="bp-return" href={`/proposals?request=${blueprint.request_id}`}>
            Return to your directions and try again.
          </Link>
        </p>
      ) : null}

      {v ? (
        <BlueprintReview
          blueprint={blueprint}
          visible={v}
          busy={busy}
          revising={revising}
          feedback={feedback}
          onFeedback={setFeedback}
          onToggleRevise={() => setRevising((open) => !open)}
          onApprove={approve}
          onRevise={revise}
        />
      ) : null}
    </BlueprintChrome>
  );
}

function BlueprintReview({
  blueprint,
  visible,
  busy,
  revising,
  feedback,
  onFeedback,
  onToggleRevise,
  onApprove,
  onRevise,
}: {
  blueprint: Blueprint;
  visible: BlueprintVisible;
  busy: boolean;
  revising: boolean;
  feedback: string;
  onFeedback: (value: string) => void;
  onToggleRevise: () => void;
  onApprove: () => void;
  onRevise: () => void;
}) {
  const moduleCount = visible.estimates.modules || visible.modules.length;
  const lessonCount =
    visible.estimates.lessons ||
    visible.modules.reduce((total, module) => total + module.lessons.length, 0);
  const estimate = studyEstimate(visible.estimates.study_hours, visible.estimates.words);
  const notes = [
    ["Introduction", visible.intellectual_arc],
    ["Level and assumptions", visible.level_and_assumed_knowledge],
    ["Central problem", visible.central_problem],
    ["Organizing principle", visible.organizing_principle],
    ["Objective", visible.objective_statement],
    ["Expected outcome", visible.expected_outcome],
  ].filter((entry): entry is [string, string] => entry[1].trim().length > 0);
  const version = blueprint.current_version;

  return (
    <>
      <header className="bp-head">
        <CourseStepLabel step={4} label="Blueprint" tight />
        <h1>Review your course plan</h1>
        <p className="bp-context">
          Check the proposed modules and lessons. Approving this plan starts the course build.
        </p>
      </header>

      <section className="bp-cover" aria-labelledby="course-title">
        <div>
          <h2 id="course-title">{visible.title}</h2>
          <div className="bp-meta">
            <span>{counted(moduleCount, "module", "modules")}</span>
            <span>{counted(lessonCount, "lesson", "lessons")}</span>
            {estimate ? <span className="bp-estimate">{estimate}</span> : null}
          </div>
        </div>
        <div className="bp-cover-status">
          <span className={blueprint.state === "failed" ? "bp-state is-failed" : "bp-state"}>
            {blueprintStateLabel[blueprint.state]}
          </span>
          {version ? (
            <span>
              Version {version}
              {blueprint.previous_versions.length > 0
                ? ` · earlier: ${blueprint.previous_versions.join(", ")}`
                : ""}
            </span>
          ) : null}
        </div>
      </section>

      <section className="bp-details" aria-labelledby="course-details-title">
        <h2 id="course-details-title">Course details</h2>
        {visible.subtitle.trim() ? <p className="bp-lead">{visible.subtitle}</p> : null}
        {visible.scope.length > 0 || visible.exclusions.length > 0 ? (
          <div className="bp-bounds">
            {visible.scope.length > 0 ? (
              <section>
                <h3>What you’ll cover</h3>
                <ul>
                  {visible.scope.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {visible.exclusions.length > 0 ? (
              <section>
                <h3>Outside the scope</h3>
                <ul>
                  {visible.exclusions.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </section>

      {notes.length > 0 ? (
        <details className="bp-fold">
          <summary>The contract</summary>
          <div className="bp-fold-body bp-plan">
            {notes.map(([title, text]) => (
              <section className="bp-plan-section" key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </section>
            ))}
          </div>
        </details>
      ) : null}

      <details className="bp-fold">
        <summary>Why this structure</summary>
        <div className="bp-fold-body bp-plan">
          {visible.order_justification.trim() ? (
            <section className="bp-plan-section">
              <h3>Progression</h3>
              <p>{visible.order_justification}</p>
            </section>
          ) : null}
          {visible.length_justification.trim() ? (
            <section className="bp-plan-section">
              <h3>Length</h3>
              <p>{visible.length_justification}</p>
            </section>
          ) : null}
          {visible.relevant_controversies.length > 0 ? (
            <section className="bp-plan-section">
              <h3>Controversies</h3>
              <ul>
                {visible.relevant_controversies.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {visible.risks_and_limitations.length > 0 ? (
            <section className="bp-plan-section">
              <h3>Risks & limitations</h3>
              <ul>
                {visible.risks_and_limitations.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {visible.guiding_sources_or_traditions.length > 0 ? (
            <section className="bp-plan-section">
              <h3>Sources and traditions</h3>
              <ul className="bp-sources">
                {visible.guiding_sources_or_traditions.map((item, index) => {
                  const href = sourceHref(item);
                  return (
                    <li key={`${index}-${item}`}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {sourceLabel(item)}
                        </a>
                      ) : (
                        item
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </details>

      <section className="bp-modules" aria-labelledby="modules-title">
        <h2 id="modules-title">Modules</h2>
        {visible.modules.map((module, moduleIndex) => (
          <details className="bp-module" key={`${moduleIndex}-${module.title}`} name="blueprint-modules">
            <summary>
              <span className="bp-num">{String(moduleIndex + 1).padStart(2, "0")}</span>
              <h3>{module.title}</h3>
            </summary>
            <div className="bp-module-body">
              {module.function.trim() ? <p>{module.function}</p> : null}
              {module.outcome.trim() ? (
                <section>
                  <h4>Outcome</h4>
                  <p>{module.outcome}</p>
                </section>
              ) : null}
              {module.guiding_questions.length > 0 ? (
                <section>
                  <h4>Guiding questions</h4>
                  <ul>
                    {module.guiding_questions.map((question, index) => (
                      <li key={`${index}-${question}`}>{question}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {module.lessons.length > 0 ? (
                <section className="bp-lessons">
                  <h4>Lessons</h4>
                  <ol className="bp-lesson-list">
                    {module.lessons.map((lesson, lessonIndex) => (
                      <li key={`${lessonIndex}-${lesson.title}`}>
                        <span>
                          {moduleIndex + 1}.{lessonIndex + 1}
                        </span>
                        <div>
                          <h4>{lesson.title}</h4>
                          {lesson.purpose.trim() ? <p>{lesson.purpose}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          </details>
        ))}
      </section>

      {blueprint.state === "awaiting_approval" && version ? (
        <footer className="bp-actions">
          <div className="bp-action-row">
            <button
              className="btn"
              type="button"
              disabled={busy}
              aria-busy={busy || undefined}
              aria-label={`Approve version ${version} and build the course`}
              onClick={onApprove}
            >
              {busy ? "Working…" : "Approve & build course"}
              {busy ? null : <span className="ar" aria-hidden="true" />}
            </button>
            <div className="bp-revision">
              <button className="bp-text-btn" type="button" disabled={busy} onClick={onToggleRevise}>
                Request changes
              </button>
              <p>Changes create a new plan version for you to review.</p>
            </div>
          </div>
          {revising ? (
            <div className="bp-revise">
              <label htmlFor="blueprint-feedback">What should change in the Blueprint?</label>
              <textarea
                id="blueprint-feedback"
                rows={4}
                maxLength={4000}
                value={feedback}
                onChange={(event) => onFeedback(event.target.value)}
              />
              <button
                className="btn"
                type="button"
                disabled={busy || !feedback.trim()}
                aria-busy={busy || undefined}
                onClick={onRevise}
              >
                {busy ? "Working…" : "Generate a revised version"}
              </button>
            </div>
          ) : null}
        </footer>
      ) : null}

      {blueprint.state === "approved" && blueprint.course_id ? (
        <footer className="bp-actions">
          <Link className="btn" href={`/courses/${blueprint.course_id}`}>
            Open the course
            <span className="ar" aria-hidden="true" />
          </Link>
        </footer>
      ) : null}
    </>
  );
}
