"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { blueprintJourneyStep, useJourneyStep } from "@/components/layout";
import {
  BulletList,
  Button,
  DefinitionList,
  outlineButtonClass,
  ErrorNotice,
  Field,
  GenerationStatus,
  Notice,
  StatusBadge,
  textareaClass,
} from "@/components/ui";
import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";
import { StageFailure, stageFailureCopy } from "@/features/course-setup/StageFailure";
import { blueprints } from "@/lib/api";
import { blueprintStateLabel } from "@/lib/labels";
import { forgetCourseFlowPath, forgetRequestId } from "@/lib/session";
import { usePolling } from "@/lib/usePolling";
import { useRedirectIfActiveBuild } from "@/hooks/useRedirectIfActiveBuild";
import type { Blueprint } from "@/types/generator";

import { PreparingCourse, type PreparingSheet } from "./PreparingCourse";

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
  const blockingActiveBuild = useRedirectIfActiveBuild(!preparing);

  useJourneyStep(blueprintJourneyStep(blueprint?.state ?? null));

  const load = useCallback(
    () =>
      blueprints.get(blueprintId).then(
        (next) => {
          setBlueprint(next);
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
    return <p className="text-sm text-muted">Checking generation status…</p>;
  }

  if (!blueprint) {
    return (
      <div className="flex flex-col gap-3">
        <GenerationStatus
          title="Opening your Blueprint"
          description="Loading the pedagogical contract for this course."
        />
        <ErrorNotice error={error} />
      </div>
    );
  }

  const v = blueprint.blueprint;
  const tone =
    blueprint.state === "approved"
      ? "success"
      : blueprint.state === "failed"
        ? "danger"
        : blueprint.state === "generating"
          ? "active"
          : "neutral";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-start gap-3">
        {blueprint.state === "generating" ? null : (
          <Link
            href={`/proposals?request=${blueprint.request_id}`}
            className={outlineButtonClass}
          >
            <span aria-hidden className="mr-1.5">
              ←
            </span>
            Back to directions
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={blueprintStateLabel[blueprint.state]} tone={tone} />
          {blueprint.current_version ? (
            <span className="text-sm text-muted">
              Version {blueprint.current_version}
              {blueprint.previous_versions.length > 0
                ? ` · previous: ${blueprint.previous_versions.join(", ")}`
                : ""}
            </span>
          ) : null}
        </div>
      </div>

      {blueprint.state === "generating" ? (
        <GenerationStatus
          title="Drafting your Blueprint"
          description="Turning your objective and chosen direction into the pedagogical contract. This page updates automatically."
        />
      ) : null}

      {blueprint.failure_message ? (
        <Notice tone="error" title="Generation problem">
          {blueprint.failure_message}
        </Notice>
      ) : null}

      {blueprint.state === "failed" ? (
        <Link
          href={`/proposals?request=${blueprint.request_id}`}
          className={outlineButtonClass}
        >
          Return to your directions and try again.
        </Link>
      ) : null}

      <ErrorNotice error={error} />

      {v ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="font-serif text-2xl font-semibold tracking-tight">{v.title}</h2>
            <p className="text-lg text-muted">{v.subtitle}</p>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold">The contract</h3>
            <DefinitionList
              items={[
                { term: "Objective", detail: v.objective_statement },
                { term: "Expected outcome", detail: v.expected_outcome },
                { term: "Central problem", detail: v.central_problem },
                { term: "Level and assumptions", detail: v.level_and_assumed_knowledge },
                { term: "Scope", detail: <BulletList items={v.scope} /> },
                { term: "Exclusions", detail: <BulletList items={v.exclusions} /> },
                { term: "Organizing principle", detail: v.organizing_principle },
              ]}
            />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">Introduction</h3>
            <p className="text-sm leading-7">{v.intellectual_arc}</p>
          </section>

          <section className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">Modules</h3>
            <ol className="flex flex-col gap-4">
              {v.modules.map((module, i) => (
                <li
                  key={module.title}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
                >
                  <h4 className="font-semibold">
                    {i + 1}. {module.title}
                  </h4>
                  <p className="text-sm leading-6">{module.function}</p>
                  <DefinitionList
                    items={[
                      {
                        term: "Guiding questions",
                        detail: <BulletList items={module.guiding_questions} />,
                      },
                      { term: "Outcome", detail: module.outcome },
                    ]}
                  />
                  <ol className="mt-1 flex flex-col gap-1 text-sm">
                    {module.lessons.map((lesson, j) => (
                      <li key={lesson.title} className="leading-6">
                        <span className="font-medium">
                          {i + 1}.{j + 1} {lesson.title}
                        </span>
                        <span className="text-muted">
                          {" "}
                          — {lesson.purpose}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-lg font-semibold">Why this structure</h3>
            <DefinitionList
              items={[
                { term: "Order", detail: v.order_justification },
                { term: "Length", detail: v.length_justification },
                {
                  term: "Estimate",
                  detail: `${v.estimates.modules} modules · ${v.estimates.lessons} lessons · ~${v.estimates.words.toLocaleString()} words · ${v.estimates.study_hours} hours`,
                },
                {
                  term: "Sources and traditions",
                  detail: <BulletList items={v.guiding_sources_or_traditions} />,
                },
                {
                  term: "Controversies",
                  detail: <BulletList items={v.relevant_controversies} />,
                },
                {
                  term: "Risks and limitations",
                  detail: <BulletList items={v.risks_and_limitations} />,
                },
              ]}
            />
          </section>

          {blueprint.state === "awaiting_approval" ? (
            <section className="flex flex-col gap-4 border-t border-line pt-6">
              <p className="text-sm text-muted">
                Approving version {blueprint.current_version} starts the course build.
                You can request changes first; each request produces a new complete
                version.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button type="button" busy={busy} onClick={approve}>
                  Approve version {blueprint.current_version} and build the course
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setRevising((x) => !x)}
                >
                  Request changes
                </Button>
              </div>
              {revising ? (
                <div className="flex flex-col gap-2">
                  <Field id="blueprint-feedback" label="What should change in the Blueprint?">
                    <textarea
                      id="blueprint-feedback"
                      className={textareaClass}
                      rows={4}
                      maxLength={4000}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    busy={busy}
                    disabled={!feedback.trim()}
                    onClick={revise}
                  >
                    Generate a revised version
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {blueprint.state === "approved" && blueprint.course_id ? (
            <Link
              href={`/courses/${blueprint.course_id}`}
              className="inline-flex w-fit items-center rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-surface cursor-pointer hover:bg-foreground/85"
            >
              Open the course
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
