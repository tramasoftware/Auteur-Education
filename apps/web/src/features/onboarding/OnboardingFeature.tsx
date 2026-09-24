"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { onboardingJourneyStep, useJourneyStep } from "@/components/layout";
import {
  BulletList,
  Button,
  ConfirmDialog,
  DefinitionList,
  ErrorNotice,
  Field,
  GenerationStatus,
  Select,
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

  useJourneyStep(onboardingJourneyStep(request));

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

  const continueToLearningDirections = async () => {
    if (!request?.objective) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await learningRequests.confirmObjective(
        request.id,
        request.objective.version,
      );
      rememberRequestId(next.id);
      router.push(`/proposals?request=${next.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const confirmObjectiveWithChanges = async (feedback: string) => {
    if (!request) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const revised = await learningRequests.reviseObjective(request.id, feedback);
      const next = await learningRequests.confirmObjective(
        revised.id,
        revised.objective!.version,
      );
      rememberRequestId(next.id);
      setRequest(next);
      router.replace(`/onboarding?request=${next.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const resetFromScratch = () => {
    forgetRequestId();
    // Full navigation resets client state; client routing alone left stale onboarding UI.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional demo reset
    window.location.assign("/onboarding");
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
      <YourIntentionSection request={request} onResetFromScratch={resetFromScratch} />

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
          onContinueToDirections={continueToLearningDirections}
          onConfirmWithChanges={confirmObjectiveWithChanges}
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
            className="inline-flex w-fit items-center rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-surface cursor-pointer hover:bg-foreground/85"
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
        <Select
          id="level"
          value={level}
          options={LEVELS}
          onChange={setLevel}
        />
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
        <GenerationStatus
          title="Reading your intention"
          description="Checking what can be taught through text and audio, and whether the learning object needs to be narrowed."
        />
      ) : null}
    </form>
  );
}

const intentionCardClass =
  "rounded-xl border border-line bg-surface";

type YourIntentionSectionProps = {
  request: LearningRequest;
  onResetFromScratch: () => void;
};

function YourIntentionSection({
  request,
  onResetFromScratch,
}: YourIntentionSectionProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmReset = () => {
    setConfirmOpen(false);
    onResetFromScratch();
  };

  return (
    <section className={`flex flex-col overflow-hidden ${intentionCardClass}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-[#eceae4]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden
            className={`inline-block text-muted transition-transform ${open ? "rotate-90" : ""}`}
          >
            ›
          </span>
          Your Intention
        </span>
        <StatusBadge label={requestStateLabel[request.state]} tone="active" />
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-line p-4">
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
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => setConfirmOpen(true)}
          >
            <span aria-hidden className="mr-1.5">
              ←
            </span>
            Start over with a new intention
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Start over?"
        description={
          <>
            This will clear your current progress and return you to the initial
            learning intention form. Your objective and any steps completed in this
            request will no longer be accessible in this session.
          </>
        }
        confirmLabel="Yes, start over"
        cancelLabel="Keep my progress"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmReset}
      />
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
      <p className="text-sm leading-6 text-muted">{p.reason}</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Precision options</legend>
        {p.options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer gap-3 rounded-xl border border-line bg-surface p-3 text-sm has-[:checked]:border-foreground"
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
              <span className="text-muted">
                {option.explanation}
              </span>
              <span className="text-xs text-muted">{option.relation_to_intention}</span>
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
      {busy ? (
        <GenerationStatus
          title="Formulating your objective"
          description="Turning the chosen learning object into a precise objective you can review."
        />
      ) : null}
    </section>
  );
}

type ObjectivePanelProps = {
  request: LearningRequest;
  busy: boolean;
  onContinueToDirections: () => void;
  onConfirmWithChanges: (feedback: string) => void;
  onRevise: (feedback: string) => void;
};

function ObjectivePanel({
  request,
  busy,
  onContinueToDirections,
  onConfirmWithChanges,
  onRevise,
}: ObjectivePanelProps) {
  const [feedback, setFeedback] = useState("");
  const o = request.objective!;
  const locked = request.state !== "objective_confirmation" && !o.confirmed;
  const hasFeedback = feedback.trim().length > 0;

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
          <Field
            id="objective-feedback"
            label="What should change?"
            hint="Leave empty to accept this objective and continue."
          >
            <textarea
              id="objective-feedback"
              className={inputClass}
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </Field>
          {hasFeedback ? (
            <Button
              type="button"
              busy={busy}
              className="self-start"
              onClick={() => {
                onConfirmWithChanges(feedback.trim());
                setFeedback("");
              }}
            >
              Confirm these changes for the objective
            </Button>
          ) : (
            <Button
              type="button"
              busy={busy}
              className="self-start"
              onClick={onContinueToDirections}
            >
              Continue to learning directions
            </Button>
          )}
        </div>
      ) : null}
      {o.confirmed && request.state !== "approved" && !request.blueprint_id ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
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
      {busy ? (
        <GenerationStatus
          title="Updating your objective"
          description="Applying this change so the objective stays precise before the next step."
        />
      ) : null}
    </section>
  );
}
