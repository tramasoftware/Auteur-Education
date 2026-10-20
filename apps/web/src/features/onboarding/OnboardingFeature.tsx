"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { onboardingJourneyStep, useJourneyStep } from "@/components/layout";
import {
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
  textareaClass,
} from "@/components/ui";
import { useRedirectIfActiveBuild } from "@/hooks/useRedirectIfActiveBuild";
import { ApiError, learningRequests } from "@/lib/api";
import { requestStateLabel } from "@/lib/labels";
import {
  forgetCourseFlowPath,
  forgetOnboardingDraft,
  forgetRequestId,
  recallOnboardingDraft,
  recallRequestId,
  rememberOnboardingDraft,
  rememberRequestId,
  type OnboardingDraft,
} from "@/lib/session";
import { createClient } from "@/lib/supabase/browser";
import type { ExperienceLevel, LearningRequest, RecoveryAlternative } from "@/types/generator";

const LEVELS: ExperienceLevel[] = ["None", "Beginner", "Intermediate", "Advanced"];
const LEVEL_NOTES: Record<ExperienceLevel, string> = {
  None: "No background yet",
  Beginner: "I’m new to this",
  Intermediate: "I know some of the ideas",
  Advanced: "I have experience in this subject",
};
/** Matches API `max_free_text_chars`; not a product rule. */
const MAX_FREE_TEXT_CHARS = 4000;

/**
 * UF-01/UF-02 in a single screen (DEC-006): intention form, compatibility,
 * learning-object precision when needed, and objective confirmation.
 */
export function OnboardingFeature() {
  const router = useRouter();
  const params = useSearchParams();
  const blockingActiveBuild = useRedirectIfActiveBuild();
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
      forgetOnboardingDraft();
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

  const analyzeIntention = async (payload: OnboardingDraft) => {
    const supabase = createClient();
    let registered = false;
    try {
      // getUser checks the token with Auth. A stale claim must not start analysis.
      const { data, error } = await supabase.auth.getUser();
      registered = !error && Boolean(data.user) && !data.user.is_anonymous;
    } catch {
      registered = false;
    }
    if (!registered) {
      rememberOnboardingDraft(payload);
      router.push(`/login?next=${encodeURIComponent("/onboarding")}`);
      return;
    }
    await run(() => learningRequests.create(payload));
  };

  const resetFromScratch = () => {
    forgetOnboardingDraft();
    forgetRequestId();
    forgetCourseFlowPath();
    // Full navigation resets client state; client routing alone left stale onboarding UI.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional demo reset
    window.location.assign("/onboarding");
  };

  if (blockingActiveBuild) {
    return <p className="text-sm text-muted">Checking generation status…</p>;
  }

  if (!request) {
    return (
      <article className="lect">
        <div className="pasosf">
          <i className="hoy" />
          <i />
          <i />
          <i />
          <span>Your question</span>
        </div>
        <IntentForm
          busy={loading}
          error={error}
          onSubmit={(payload) => {
            void analyzeIntention(payload);
          }}
        />
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {request.state === "precision_required" || request.objective ? null : (
        <YourIntentionSection request={request} onResetFromScratch={resetFromScratch} />
      )}

      {request.state === "incompatible" ? (
        <IncompatibleIntention
          busy={loading}
          onStartOver={resetFromScratch}
          onUseIntention={(payload) => run(() => learningRequests.create(payload))}
          request={request}
        />
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
    </div>
  );
}

type IntentFormProps = {
  busy: boolean;
  error: unknown;
  onSubmit: (payload: OnboardingDraft) => void;
};

function subscribeOnboardingDraft(): () => void {
  return () => {};
}

function IntentForm({ busy, error, onSubmit }: IntentFormProps) {
  const draft = useSyncExternalStore(
    subscribeOnboardingDraft,
    recallOnboardingDraft,
    () => null,
  );
  const [intent, setIntent] = useState<string | null>(null);
  const [level, setLevel] = useState<ExperienceLevel | null>(null);
  const [prior, setPrior] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const intentValue = intent ?? draft?.initial_intent ?? "";
  const levelValue = level ?? draft?.experience_level ?? "Beginner";
  const priorValue = prior ?? draft?.prior_knowledge ?? "";
  const outcomeValue = outcome ?? draft?.expected_outcome ?? "";
  const priorDetails = useRef<HTMLDetailsElement>(null);
  const revealedPrior = useRef(false);

  useEffect(() => {
    const details = priorDetails.current;
    if (details && priorValue.trim() && !revealedPrior.current) {
      details.open = true;
      revealedPrior.current = true;
    }
    document.querySelectorAll<HTMLTextAreaElement>(".onboarding-screen .plano textarea").forEach((field) => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    });
  }, [intentValue, outcomeValue, priorValue]);

  const fieldError = (field: string) =>
    error instanceof ApiError
      ? error.details.find((d) => d.field === field)?.issue ?? null
      : null;
  const intentError =
    error instanceof ApiError && error.code === "non_english_input"
      ? error.message
      : fieldError("initial_intent");
  const formNotice =
    (error instanceof ApiError &&
      error.code !== "validation_error" &&
      error.code !== "non_english_input") ||
    (!(error instanceof ApiError) && Boolean(error));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      initial_intent: intentValue.trim(),
      experience_level: levelValue,
      prior_knowledge: priorValue.trim() || null,
      expected_outcome: outcomeValue.trim(),
    });
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="preg disp">
        <h1 id="intent-label">What would you like to understand?</h1>
        <p className="bajada" id="intent-hint">
          A sentence is enough to start.
        </p>
        <label className="plano">
          <span className="sr-only">What would you like to understand?</span>
          <textarea
            id="intent"
            rows={1}
            required
            maxLength={MAX_FREE_TEXT_CHARS}
            value={intentValue}
            placeholder="For example: why my neighborhood has changed so much in ten years."
            onChange={(e) => setIntent(e.target.value)}
            aria-labelledby="intent-label"
            aria-invalid={intentError ? true : undefined}
            aria-describedby={intentError ? "intent-error" : "intent-hint"}
          />
        </label>
        {intentError ? (
          <p className="field-error" id="intent-error" role="alert">
            {intentError}
          </p>
        ) : null}
      </div>

      <div className="preg">
        <h2 id="outcome-label">What would you like to do with what you learn?</h2>
        <label className="plano">
          <span className="sr-only">What would you like to do with what you learn?</span>
          <textarea
            id="outcome"
            rows={1}
            required
            maxLength={MAX_FREE_TEXT_CHARS}
            value={outcomeValue}
            placeholder="For example: explain why one neighborhood draws people in while another empties out."
            onChange={(e) => setOutcome(e.target.value)}
            aria-labelledby="outcome-label"
            aria-invalid={fieldError("expected_outcome") ? true : undefined}
            aria-describedby={fieldError("expected_outcome") ? "outcome-error" : undefined}
          />
        </label>
        {fieldError("expected_outcome") ? (
          <p className="field-error" id="outcome-error" role="alert">
            {fieldError("expected_outcome")}
          </p>
        ) : null}
      </div>

      <div className="preg">
        <h2 id="level-label">Where are you starting from?</h2>
        <div className="niveles" role="radiogroup" aria-labelledby="level-label">
          {LEVELS.map((option) => (
            <label className="niv" key={option}>
              <input
                type="radio"
                name="experience_level"
                value={option}
                checked={levelValue === option}
                onChange={() => setLevel(option)}
              />
              <span className="c" aria-hidden="true" />
              <b>{option}</b>
              <small>{LEVEL_NOTES[option]}</small>
            </label>
          ))}
        </div>
        {fieldError("experience_level") ? (
          <p className="field-error" role="alert">
            {fieldError("experience_level")}
          </p>
        ) : null}

        <details
          className="extra"
          ref={priorDetails}
          onToggle={() => {
            document
              .querySelectorAll<HTMLTextAreaElement>(".onboarding-screen .plano textarea")
              .forEach((field) => {
                field.style.height = "auto";
                field.style.height = `${field.scrollHeight}px`;
              });
          }}
        >
          <summary>
            <span className="mas" aria-hidden="true" />
            <span className="txt">What you already know (optional)</span>
          </summary>
          <label className="plano">
            <span className="sr-only">Previous knowledge (optional)</span>
            <textarea
              id="prior"
              rows={1}
              maxLength={MAX_FREE_TEXT_CHARS}
              value={priorValue}
              placeholder="For example: I’ve read Jane Jacobs; I’ve taken an art history course."
              onChange={(e) => setPrior(e.target.value)}
              aria-invalid={fieldError("prior_knowledge") ? true : undefined}
              aria-describedby={fieldError("prior_knowledge") ? "prior-error" : undefined}
            />
          </label>
          {fieldError("prior_knowledge") ? (
            <p className="field-error" id="prior-error" role="alert">
              {fieldError("prior_knowledge")}
            </p>
          ) : null}
        </details>
      </div>

      <div className="acciones pie-l">
        <span className="nota">Your first lesson is free with an account. No card needed.</span>
        <button
          className="btn"
          type="submit"
          disabled={busy || !intentValue.trim() || !outcomeValue.trim()}
          aria-busy={busy || undefined}
        >
          {busy ? "Working…" : "Analyze my intention"}
          {busy ? null : <span className="ar" aria-hidden="true" />}
        </button>
      </div>
      {formNotice || busy ? (
        <div className="form-avisos">
          {formNotice ? <ErrorNotice error={error} /> : null}
          {busy ? (
            <GenerationStatus
              title="Reading your intention"
              description="Checking what can be taught through text and audio, and whether the learning object needs to be narrowed."
            />
          ) : null}
        </div>
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

type RecoveryPayload = {
  initial_intent: string;
  experience_level: ExperienceLevel;
  prior_knowledge: string | null;
  expected_outcome: string;
};

function IncompatibleIntention({
  request,
  busy,
  onStartOver,
  onUseIntention,
}: {
  request: LearningRequest;
  busy: boolean;
  onStartOver: () => void;
  onUseIntention: (payload: RecoveryPayload) => void;
}) {
  const { explanation, safe_reframing: alternative } = request.compatibility;
  const alternatives = request.compatibility.recovery_alternatives ?? [];

  if (alternatives.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <Notice tone="info" title="This intention is incompatible">
          <p>
            Auteur teaches through written text and narrated audio. This request
            asks for a result those formats cannot teach, so it cannot continue.
          </p>
          {explanation.trim() ? <p className="mt-2">{explanation}</p> : null}
          {alternative ? (
            <p className="mt-2">
              A related idea can be a new intention. It is not the same as the
              practical result. {alternative}
            </p>
          ) : null}
        </Notice>
        <Button type="button" className="self-start" onClick={onStartOver}>
          Write a new intention
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <Notice tone="info" title="This intention cannot be taught as asked">
        <p>
          Auteur teaches through written text and narrated audio. This request
          asks for a result those formats cannot teach, so it cannot continue.
        </p>
        {explanation.trim() ? <p className="mt-2">{explanation}</p> : null}
        <p className="mt-2">
          These related directions can be taught that way. Open one, edit it if
          you want, and choose it to start a new intention. It is not the same
          result.
        </p>
      </Notice>
      <h2 className="text-lg font-semibold">Choose one of these directions</h2>
      <ul className="flex flex-col gap-4">
        {alternatives.map((item, index) => (
          <RecoveryAlternativeCard
            key={`${item.title}-${index}`}
            item={item}
            index={index}
            busy={busy}
            onChoose={onUseIntention}
          />
        ))}
      </ul>
      {busy ? (
        <GenerationStatus
          title="Reading your intention"
          description="Checking what can be taught through text and audio, and whether the learning object needs to be narrowed."
        />
      ) : null}
      <Button type="button" variant="outline" className="self-start" onClick={onStartOver}>
        Write a new intention
      </Button>
    </section>
  );
}

function RecoveryAlternativeCard({
  item,
  index,
  busy,
  onChoose,
}: {
  item: RecoveryAlternative;
  index: number;
  busy: boolean;
  onChoose: (payload: RecoveryPayload) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [intent, setIntent] = useState(item.suggested_intent);
  const [level, setLevel] = useState<ExperienceLevel>("None");
  const [prior, setPrior] = useState("");
  const [outcome, setOutcome] = useState(item.suggested_outcome);
  const fieldId = (name: string) => `recovery-${index}-${name}`;
  const ready = intent.trim().length > 0 && outcome.trim().length > 0;

  const choose = () => {
    if (!ready) {
      return;
    }
    onChoose({
      initial_intent: intent.trim(),
      experience_level: level,
      prior_knowledge: prior.trim() || null,
      expected_outcome: outcome.trim(),
    });
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h3 className="font-serif text-base font-semibold">{item.title}</h3>
        <p className="text-sm text-muted">{item.explanation}</p>
      </div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          expanded ? "grid-rows-[1fr] opacity-100" : "-mb-3 grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className={expanded ? "overflow-visible" : "pointer-events-none overflow-hidden"}>
          <div className="flex flex-col gap-3">
            {editing ? (
              <div className="flex flex-col gap-5">
                <Field id={fieldId("intent")} label="What do you want to learn?">
                  <textarea
                    id={fieldId("intent")}
                    className={textareaClass}
                    rows={3}
                    required
                    maxLength={MAX_FREE_TEXT_CHARS}
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                  />
                </Field>
                <Field id={fieldId("level")} label="Your current level">
                  <Select
                    id={fieldId("level")}
                    value={level}
                    options={LEVELS}
                    onChange={setLevel}
                  />
                </Field>
                <Field
                  id={fieldId("prior")}
                  label="Previous knowledge (optional)"
                  hint="Books, courses, or experience that shape where you start."
                >
                  <textarea
                    id={fieldId("prior")}
                    className={textareaClass}
                    rows={2}
                    maxLength={MAX_FREE_TEXT_CHARS}
                    value={prior}
                    onChange={(event) => setPrior(event.target.value)}
                  />
                </Field>
                <Field
                  id={fieldId("outcome")}
                  label="What do you want to be able to do or understand?"
                >
                  <textarea
                    id={fieldId("outcome")}
                    className={textareaClass}
                    rows={2}
                    required
                    maxLength={MAX_FREE_TEXT_CHARS}
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <DefinitionList
                items={[
                  { term: "Intention", detail: intent },
                  { term: "Level", detail: level },
                  {
                    term: "Prior knowledge",
                    detail: prior.trim() || "Not provided",
                  },
                  { term: "Expected outcome", detail: outcome },
                ]}
              />
            )}
            {editing ? null : (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            )}
            <Button
              type="button"
              busy={busy}
              disabled={busy || !ready}
              onClick={choose}
              className="self-start"
            >
              Choose this direction
            </Button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-foreground"
            >
              Read less
              <span aria-hidden className="inline-block -rotate-90 text-base leading-none">
                ›
              </span>
            </button>
          </div>
        </div>
      </div>
      {expanded ? null : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-foreground"
        >
          Read more
          <span aria-hidden className="inline-block rotate-90 text-base leading-none">
            ›
          </span>
        </button>
      )}
    </li>
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
    <article className="lect">
      <div className="pasosf">
        <i className="fue" />
        <i className="hoy" />
        <i />
        <i />
        <span>Refine your subject</span>
      </div>

      <div className="preg disp">
        <h1 id="precision-label">Where should we look closer?</h1>
        <p className="bajada">{p.reason || "Choose a focus for your course."}</p>
      </div>

      <div className="preg">
        <div className="niveles" role="radiogroup" aria-labelledby="precision-label">
          {p.options.map((option) => (
            <label className="niv" key={option.id}>
              <input
                type="radio"
                name="precision"
                value={option.id}
                checked={optionId === option.id}
                onChange={() => {
                  setOptionId(option.id);
                  setFreeText("");
                }}
              />
              <span className="c" aria-hidden="true" />
              <b>{option.title}</b>
              <small>{option.explanation}</small>
              {option.relation_to_intention ? (
                <small className="rel">{option.relation_to_intention}</small>
              ) : null}
            </label>
          ))}
        </div>
      </div>

      {p.allows_free_text ? (
        <div className="preg">
          <h2 id="free-text-label">Or describe your own focus</h2>
          <label className="plano">
            <span className="sr-only">Or describe your own focus</span>
            <textarea
              id="free-text"
              rows={1}
              maxLength={MAX_FREE_TEXT_CHARS}
              value={freeText}
              placeholder="For example: the difference between social and demographic drivers of neighborhood change."
              onChange={(e) => {
                setFreeText(e.target.value);
                setOptionId("");
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
              }}
              aria-labelledby="free-text-label"
            />
          </label>
        </div>
      ) : null}

      <div className="acciones pie-l">
        <span className="nota">This focus will shape the objective.</span>
        <button
          className="btn"
          type="button"
          disabled={busy || (!optionId && !freeText.trim())}
          aria-busy={busy || undefined}
          onClick={() =>
            onChoose(optionId ? { option_id: optionId } : { free_text: freeText.trim() })
          }
        >
          {busy ? "Working…" : "Formulate my objective"}
          {busy ? null : <span className="ar" aria-hidden="true" />}
        </button>
      </div>
      {busy ? (
        <div className="form-avisos">
          <GenerationStatus
            title="Formulating your objective"
            description="Turning the chosen learning object into a precise objective you can review."
          />
        </div>
      ) : null}
    </article>
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
  const canRevise =
    o.confirmed && request.state !== "approved" && !request.blueprint_id;
  const hadPrecision =
    request.precision.needs_precision || request.selected_precision !== null;

  const grow = (field: HTMLTextAreaElement) => {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  };

  const primaryLabel = hasFeedback
    ? o.confirmed
      ? "Reformulate objective"
      : "Confirm these changes"
    : "Continue to learning directions";

  return (
    <article className="lect">
      <div className="pasosf">
        <i className="fue" />
        {hadPrecision ? <i className="fue" /> : null}
        <i className="hoy" />
        <i />
        {!hadPrecision ? <i /> : null}
        <span>Your objective</span>
      </div>

      <div className="preg disp">
        <h1>Is this the objective?</h1>
        <p className="bajada">Review it before we generate learning paths.</p>
        <p className="obj-statement">{o.statement}</p>
      </div>

      <div className="preg">
        <dl className="obj-facts">
          <dt>You will be able to</dt>
          <dd>{o.observable_capability}</dd>
          <dt>Object of learning</dt>
          <dd>{o.learning_object}</dd>
          <dt>Assumed level</dt>
          <dd>{o.assumed_level_and_knowledge}</dd>
          <dt>Scope</dt>
          <dd>
            {o.scope.length > 0 ? (
              <ul>
                {o.scope.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              "None named."
            )}
          </dd>
          <dt>Exclusions</dt>
          <dd>
            {o.exclusions.length > 0 ? (
              <ul>
                {o.exclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              "None named."
            )}
          </dd>
          <dt>Signs of achievement</dt>
          <dd>
            {o.achievement_criteria.length > 0 ? (
              <ul>
                {o.achievement_criteria.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              "None named."
            )}
          </dd>
          {o.medium_limitations.length > 0 ? (
            <>
              <dt>Limits of text and audio</dt>
              <dd>
                <ul>
                  {o.medium_limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      {!o.confirmed && !locked ? (
        <div className="preg">
          <h2 id="objective-feedback-label">What should change?</h2>
          <p className="bajada">Leave empty to accept this objective and continue.</p>
          <label className="plano">
            <span className="sr-only">What should change?</span>
            <textarea
              id="objective-feedback"
              className="alto"
              rows={2}
              maxLength={MAX_FREE_TEXT_CHARS}
              value={feedback}
              placeholder="For example: keep the comparative focus, but start from household structure rather than migration."
              onChange={(e) => {
                setFeedback(e.target.value);
                grow(e.currentTarget);
              }}
              aria-labelledby="objective-feedback-label"
            />
          </label>
        </div>
      ) : null}

      {canRevise ? (
        <details className="extra">
          <summary>
            <span className="mas" aria-hidden="true" />
            <span className="txt">Change the objective (this discards current proposals)</span>
          </summary>
          <label className="plano">
            <span className="sr-only">What should change?</span>
            <textarea
              className="alto"
              rows={2}
              maxLength={MAX_FREE_TEXT_CHARS}
              value={feedback}
              placeholder="For example: keep the comparative focus, but start from household structure rather than migration."
              onChange={(e) => {
                setFeedback(e.target.value);
                grow(e.currentTarget);
              }}
            />
          </label>
        </details>
      ) : null}

      <div className="acciones pie-l">
        <span className="nota">This objective will shape the learning paths.</span>
        <button
          className="btn"
          type="button"
          disabled={busy || locked}
          aria-busy={busy || undefined}
          onClick={() => {
            if (hasFeedback && o.confirmed) {
              onRevise(feedback.trim());
              setFeedback("");
              return;
            }
            if (hasFeedback) {
              onConfirmWithChanges(feedback.trim());
              setFeedback("");
              return;
            }
            void onContinueToDirections();
          }}
        >
          {busy ? "Working…" : primaryLabel}
          {busy ? null : <span className="ar" aria-hidden="true" />}
        </button>
      </div>
      {busy ? (
        <div className="form-avisos">
          <GenerationStatus
            title="Updating your objective"
            description="Applying this change so the objective stays precise before the next step."
          />
        </div>
      ) : null}
    </article>
  );
}
