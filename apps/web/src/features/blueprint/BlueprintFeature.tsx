"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  BulletList,
  Button,
  DefinitionList,
  ErrorNotice,
  Field,
  Notice,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { blueprints } from "@/lib/api";
import { blueprintStateLabel } from "@/lib/labels";
import { usePolling } from "@/lib/usePolling";
import type { Blueprint } from "@/types/generator";

/** UF-04: review the visible Blueprint, request changes, approve the exact version. */
export function BlueprintFeature({ blueprintId }: { blueprintId: string }) {
  const router = useRouter();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [revising, setRevising] = useState(false);

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
    try {
      const result = await blueprints.approve(blueprintId, blueprint.current_version);
      router.push(`/courses/${result.course_id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
      load();
    }
  };

  if (!blueprint) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500">Loading…</p>
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
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge label={blueprintStateLabel[blueprint.state]} tone={tone} />
        {blueprint.current_version ? (
          <span className="text-sm text-zinc-500">
            Version {blueprint.current_version}
            {blueprint.previous_versions.length > 0
              ? ` · previous: ${blueprint.previous_versions.join(", ")}`
              : ""}
          </span>
        ) : null}
        <Link
          href={`/proposals?request=${blueprint.request_id}`}
          className="text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          Back to directions
        </Link>
      </div>

      {blueprint.state === "generating" ? (
        <Notice tone="info" title="Drafting your Blueprint">
          Auteur is turning your objective and chosen direction into a pedagogical
          contract. This page updates automatically.
        </Notice>
      ) : null}

      {blueprint.failure_message ? (
        <Notice tone="error" title="Generation problem">
          {blueprint.failure_message}
        </Notice>
      ) : null}

      {blueprint.state === "failed" ? (
        <Link
          href={`/proposals?request=${blueprint.request_id}`}
          className="text-sm underline underline-offset-4"
        >
          Return to your directions and try again.
        </Link>
      ) : null}

      <ErrorNotice error={error} />

      {v ? (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">{v.title}</h2>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">{v.subtitle}</p>
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
            <h3 className="text-lg font-semibold">Intellectual arc</h3>
            <p className="text-sm leading-7">{v.intellectual_arc}</p>
          </section>

          <section className="flex flex-col gap-4">
            <h3 className="text-lg font-semibold">Modules</h3>
            <ol className="flex flex-col gap-4">
              {v.modules.map((module, i) => (
                <li
                  key={module.title}
                  className="flex flex-col gap-2 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
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
                        <span className="text-zinc-600 dark:text-zinc-400">
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
            <section className="flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
                      className={inputClass}
                      rows={4}
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
              className="inline-flex w-fit items-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
            >
              Open the course
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
