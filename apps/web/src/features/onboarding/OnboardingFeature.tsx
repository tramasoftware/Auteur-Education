"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

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
import { ApiError, learningRequests } from "@/lib/api";
import { requestStateLabel } from "@/lib/labels";
import { forgetRequestId, recallRequestId, rememberRequestId } from "@/lib/session";
import type { ExperienceLevel, LearningRequest } from "@/types/generator";

const LEVELS: ExperienceLevel[] = ["None", "Basic", "Intermediate", "Advanced"];

/**
 * UF-01/UF-02 in a single screen (DEC-006): intention form, compatibility,
 * learning-object precision when needed, and objective confirmation.
 */
export function OnboardingFeature() {
  const router = useRouter();
  const params = useSearchParams();
  const [request, setRequest] = useState<LearningRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const id = params.get("request") ?? recallRequestId();
    if (!id || request) {
      return;
    }
    learningRequests
      .get(id)
      .then(setRequest)
      .catch(() => forgetRequestId());
  }, [params, request]);

  const run = async (action: () => Promise<LearningRequest>) => {
    setLoading(true);
    setError(null);
    try {
      const next = await action();
      rememberRequestId(next.id);
      setRequest(next);
      router.replace(`/onboarding?request=${next.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    forgetRequestId();
    setRequest(null);
    setError(null);
    router.replace("/onboarding");
  };

  if (!request) {
    return (
      <div className="flex flex-col gap-6">
        <IntentForm
          busy={loading}
          error={error}
          onSubmit={(payload) => run(() => learningRequests.create(payload))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Your intention</h2>
          <StatusBadge label={requestStateLabel[request.state]} tone="active" />
        </div>
        <DefinitionList
          items={[
            { term: "Intention", detail: request.inputs.initial_intent },
            { term: "Level", detail: request.inputs.experience_level },
            {
              term: "Prior knowledge",
              detail: request.inputs.prior_knowledge ?? "Not provided",
            },
            { term: "Expected outcome", detail: request.inputs.expected_outcome },
          ]}
        />
        <button
          type="button"
          onClick={reset}
          className="self-start text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          Start over with a new intention
        </button>
      </section>

      <CompatibilityPanel request={request} />

      {request.state === "incompatible" ? (
        <Notice tone="info" title="This request cannot continue">
          Auteur teaches theory through text and audio. Consider a theoretical
          reframing above, then start over with a new intention.
        </Notice>
      ) : null}

      {request.state === "precision_required" ? (
        <PrecisionPanel
          request={request}
          busy={loading}
          onChoose={(payload) =>
            run(() => learningRequests.choosePrecision(request.id, payload))
          }
        />
      ) : null}

      {request.objective ? (
        <ObjectivePanel
          request={request}
          busy={loading}
          onConfirm={() =>
            run(() =>
              learningRequests.confirmObjective(
                request.id,
                request.objective!.version,
              ),
            )
          }
          onRevise={(feedback) =>
            run(() => learningRequests.reviseObjective(request.id, feedback))
          }
        />
      ) : null}

      <ErrorNotice error={error} />

      {request.objective?.confirmed ? (
        <div className="flex flex-col gap-2">
          <Link
            href={`/proposals?request=${request.id}`}
            className="inline-flex w-fit items-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Continue to learning directions
          </Link>
        </div>
      ) : null}
    </div>
  );
}

type IntentFormProps = {
  busy: boolean;
  error: unknown;
  onSubmit: (payload: {
    initial_intent: string;
    experience_level: ExperienceLevel;
    prior_knowledge: string | null;
    expected_outcome: string;
  }) => void;
};

function IntentForm({ busy, error, onSubmit }: IntentFormProps) {
  const [intent, setIntent] = useState("");
  const [level, setLevel] = useState<ExperienceLevel>("Basic");
  const [prior, setPrior] = useState("");
  const [outcome, setOutcome] = useState("");

  const fieldError = (field: string) =>
    error instanceof ApiError
      ? error.details.find((d) => d.field === field)?.issue ?? null
      : null;
  const intentError =
    error instanceof ApiError && error.code === "non_english_input"
      ? error.message
      : fieldError("initial_intent");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      initial_intent: intent.trim(),
      experience_level: level,
      prior_knowledge: prior.trim() || null,
      expected_outcome: outcome.trim(),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Field
        id="intent"
        label="What do you want to learn?"
        hint="Describe it in English, in your own words."
        error={intentError}
      >
        <textarea
          id="intent"
          className={inputClass}
          rows={3}
          required
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          aria-invalid={intentError ? true : undefined}
          aria-describedby={intentError ? "intent-error" : "intent-hint"}
        />
      </Field>
      <Field id="level" label="Your current level" error={fieldError("experience_level")}>
        <select
          id="level"
          className={inputClass}
          value={level}
          onChange={(e) => setLevel(e.target.value as ExperienceLevel)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id="prior"
        label="Previous knowledge (optional)"
        hint="Books, courses, or experience that shape where you start."
        error={fieldError("prior_knowledge")}
      >
        <textarea
          id="prior"
          className={inputClass}
          rows={2}
          value={prior}
          onChange={(e) => setPrior(e.target.value)}
        />
      </Field>
      <Field
        id="outcome"
        label="What do you want to be able to do or understand?"
        error={fieldError("expected_outcome")}
      >
        <textarea
          id="outcome"
          className={inputClass}
          rows={2}
          required
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
      </Field>
      {error instanceof ApiError &&
      error.code !== "validation_error" &&
      error.code !== "non_english_input" ? (
        <ErrorNotice error={error} />
      ) : null}
      {!(error instanceof ApiError) && error ? <ErrorNotice error={error} /> : null}
      <Button type="submit" busy={busy} disabled={!intent.trim() || !outcome.trim()}>
        Analyze my intention
      </Button>
      {busy ? (
        <p className="text-sm text-zinc-500" role="status">
          Interpreting your intention and checking what text and audio can teach…
        </p>
      ) : null}
    </form>
  );
}

function CompatibilityPanel({ request }: { request: LearningRequest }) {
  const c = request.compatibility;
  const tone =
    c.classification === "Incompatible"
      ? "danger"
      : c.classification === "Allowed with reframing"
        ? "active"
        : "success";
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Compatibility</h2>
        <StatusBadge label={c.classification} tone={tone} />
      </div>
      <p className="text-sm leading-6">{c.explanation}</p>
      {c.safe_reframing ? (
        <DefinitionList
          items={[{ term: "Theoretical reframing", detail: c.safe_reframing }]}
        />
      ) : null}
      {c.unreachable_aspects.length > 0 ? (
        <DefinitionList
          items={[
            {
              term: "Not achievable through text and audio",
              detail: <BulletList items={c.unreachable_aspects} />,
            },
          ]}
        />
      ) : null}
    </section>
  );
}

type PrecisionPanelProps = {
  request: LearningRequest;
  busy: boolean;
  onChoose: (payload: { option_id?: string; free_text?: string }) => void;
};

function PrecisionPanel({ request, busy, onChoose }: PrecisionPanelProps) {
  const [optionId, setOptionId] = useState<string>("");
  const [freeText, setFreeText] = useState("");
  const p = request.precision;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Narrow the object of learning</h2>
      <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{p.reason}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Precision options</legend>
        {p.options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer gap-3 rounded-md border border-zinc-200 p-3 text-sm has-[:checked]:border-zinc-950 dark:border-zinc-800 dark:has-[:checked]:border-zinc-50"
          >
            <input
              type="radio"
              name="precision"
              value={option.id}
              checked={optionId === option.id}
              onChange={() => {
                setOptionId(option.id);
                setFreeText("");
              }}
              className="mt-1"
            />
            <span className="flex flex-col gap-1">
              <span className="font-medium">{option.title}</span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {option.explanation}
              </span>
              <span className="text-xs text-zinc-500">{option.relation_to_intention}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {p.allows_free_text ? (
        <Field id="free-text" label="Or describe your own focus">
          <input
            id="free-text"
            className={inputClass}
            value={freeText}
            onChange={(e) => {
              setFreeText(e.target.value);
              setOptionId("");
            }}
          />
        </Field>
      ) : null}
      <Button
        type="button"
        busy={busy}
        disabled={!optionId && !freeText.trim()}
        onClick={() =>
          onChoose(optionId ? { option_id: optionId } : { free_text: freeText.trim() })
        }
      >
        Formulate my objective
      </Button>
    </section>
  );
}

type ObjectivePanelProps = {
  request: LearningRequest;
  busy: boolean;
  onConfirm: () => void;
  onRevise: (feedback: string) => void;
};

function ObjectivePanel({ request, busy, onConfirm, onRevise }: ObjectivePanelProps) {
  const [revising, setRevising] = useState(false);
  const [feedback, setFeedback] = useState("");
  const o = request.objective!;
  const locked = request.state !== "objective_confirmation" && !o.confirmed;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Learning objective</h2>
        <StatusBadge
          label={o.confirmed ? `Confirmed · v${o.version}` : `Draft · v${o.version}`}
          tone={o.confirmed ? "success" : "neutral"}
        />
      </div>
      <p className="text-base leading-7">{o.statement}</p>
      <DefinitionList
        items={[
          { term: "You will be able to", detail: o.observable_capability },
          { term: "Object of learning", detail: o.learning_object },
          { term: "Assumed level", detail: o.assumed_level_and_knowledge },
          { term: "Scope", detail: <BulletList items={o.scope} /> },
          { term: "Exclusions", detail: <BulletList items={o.exclusions} /> },
          {
            term: "Signs of achievement",
            detail: <BulletList items={o.achievement_criteria} />,
          },
          ...(o.medium_limitations.length > 0
            ? [
                {
                  term: "Limits of text and audio",
                  detail: <BulletList items={o.medium_limitations} />,
                },
              ]
            : []),
        ]}
      />
      {!o.confirmed && !locked ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Button type="button" busy={busy} onClick={onConfirm}>
              Confirm this objective
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setRevising((v) => !v)}
            >
              Request changes
            </Button>
          </div>
          {revising ? (
            <div className="flex flex-col gap-2">
              <Field id="objective-feedback" label="What should change?">
                <textarea
                  id="objective-feedback"
                  className={inputClass}
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                busy={busy}
                disabled={!feedback.trim()}
                onClick={() => {
                  onRevise(feedback.trim());
                  setFeedback("");
                  setRevising(false);
                }}
              >
                Reformulate objective
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {o.confirmed && request.state !== "approved" && !request.blueprint_id ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">
            Change the objective (this discards current proposals)
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              aria-label="What should change?"
              className={inputClass}
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              busy={busy}
              disabled={!feedback.trim()}
              onClick={() => {
                onRevise(feedback.trim());
                setFeedback("");
              }}
            >
              Reformulate objective
            </Button>
          </div>
        </details>
      ) : null}
    </section>
  );
}
