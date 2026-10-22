"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { onboardingJourneyStep, useJourneyStep } from "@/components/layout";
import {
  DefinitionList,
  ErrorNotice,
  GenerationStatus,
  StatusBadge,
} from "@/components/ui";
import { StageFailure, stageFailureCopy } from "@/features/course-setup/StageFailure";
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

function isIntentionFieldError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === "validation_error" || err.code === "non_english_input")
  );
}

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
  const [failure, setFailure] = useState<(typeof stageFailureCopy)[keyof typeof stageFailureCopy] | null>(
    null,
  );
  const retryRef = useRef<() => void>(() => {});

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

  const run = async (
    action: () => Promise<LearningRequest>,
    failureCopy: (typeof stageFailureCopy)[keyof typeof stageFailureCopy] | null = null,
    keepFieldErrors = false,
  ) => {
    setLoading(true);
    setError(null);
    try {
      const next = await action();
      setFailure(null);
      forgetOnboardingDraft();
      rememberRequestId(next.id);
      setRequest(next);
      router.replace(`/onboarding?request=${next.id}`);
    } catch (err) {
      if (failureCopy && !(keepFieldErrors && isIntentionFieldError(err))) {
        retryRef.current = () => {
          void run(action, failureCopy, keepFieldErrors);
        };
        setFailure(failureCopy);
        setError(null);
      } else {
        setFailure(null);
        setError(err);
      }
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
      setFailure(null);
      router.push(`/proposals?request=${next.id}`);
    } catch {
      retryRef.current = () => {
        void continueToLearningDirections();
      };
      setFailure(stageFailureCopy.directions);
      setError(null);
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
    await run(() => learningRequests.create(payload), stageFailureCopy.intention, true);
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

  const failureScreen = failure ? (
    <StageFailure
      {...failure}
      busy={loading}
      onRetry={() => retryRef.current()}
      onBack={() => setFailure(null)}
    />
  ) : null;

  if (!request) {
    return (
      <>
      <article className="lect" hidden={failure ? true : undefined} inert={failure ? true : undefined}>
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
      {failureScreen}
      </>
    );
  }

  return (
    <>
    <div className="flex flex-col gap-8" hidden={failure ? true : undefined} inert={failure ? true : undefined}>
      {request.state === "precision_required" ||
      request.state === "incompatible" ||
      request.objective ? null : (
        <YourIntentionSection request={request} onResetFromScratch={resetFromScratch} />
      )}

      {request.state === "incompatible" ? (
        <IncompatibleIntention
          busy={loading}
          onStartOver={resetFromScratch}
          onUseIntention={(payload) =>
            run(() => learningRequests.create(payload), stageFailureCopy.suggested, true)
          }
          request={request}
        />
      ) : null}

      {request.state === "precision_required" ? (
        <PrecisionPanel
          request={request}
          busy={loading}
          onReset={resetFromScratch}
          onChoose={(payload) =>
            run(() => learningRequests.choosePrecision(request.id, payload), stageFailureCopy.precision)
          }
        />
      ) : null}

      {request.objective ? (
        <ObjectivePanel
          request={request}
          busy={loading}
          onReset={resetFromScratch}
          onContinueToDirections={continueToLearningDirections}
          onConfirmWithChanges={confirmObjectiveWithChanges}
          onRevise={(feedback) =>
            run(() => learningRequests.reviseObjective(request.id, feedback))
          }
        />
      ) : null}

      <ErrorNotice error={error} />
    </div>
    {failureScreen}
    </>
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

function ReformulateIntention({
  busy = false,
  onReset,
}: {
  busy?: boolean;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy]);

  return (
    <>
      <button
        className="reform-link"
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Reformulate your intention
      </button>
      {open ? (
        <div className="reform-modal">
          <button
            className="reform-backdrop"
            type="button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={() => setOpen(false)}
          />
          <div
            className="reform-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <h2 id={titleId}>Reformulate your intention?</h2>
            <p id={descriptionId}>
              This clears the intention saved in this session and returns you to the
              first form. The objective and any steps completed here will no longer be
              available.
            </p>
            <div className="acciones">
              <button className="btn" type="button" disabled={busy} onClick={onReset}>
                Yes, start over
              </button>
              <button
                className="btn fantasma"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Keep my progress
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
          <ReformulateIntention onReset={onResetFromScratch} />
        </div>
      ) : null}
    </section>
  );
}

type RecoveryPayload = {
  initial_intent: string;
  experience_level: ExperienceLevel;
  prior_knowledge: string | null;
  expected_outcome: string;
};

type AltDraft = {
  initial_intent: string;
  experience_level: ExperienceLevel;
  prior_knowledge: string;
  expected_outcome: string;
};

function draftFromAlternative(item: RecoveryAlternative): AltDraft {
  return {
    initial_intent: item.suggested_intent,
    experience_level: "None",
    prior_knowledge: "",
    expected_outcome: item.suggested_outcome,
  };
}

function draftReady(draft: AltDraft): boolean {
  return draft.initial_intent.trim().length > 0 && draft.expected_outcome.trim().length > 0;
}

function toRecoveryPayload(draft: AltDraft): RecoveryPayload {
  return {
    initial_intent: draft.initial_intent.trim(),
    experience_level: draft.experience_level,
    prior_knowledge: draft.prior_knowledge.trim() || null,
    expected_outcome: draft.expected_outcome.trim(),
  };
}

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
  const [drafts, setDrafts] = useState<AltDraft[]>(() => alternatives.map(draftFromAlternative));
  const [selected, setSelected] = useState<number | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const alternativeKey = alternatives
    .map((item) => `${item.title}:${item.suggested_intent}`)
    .join("|");

  useEffect(() => {
    setDrafts(alternatives.map(draftFromAlternative));
    setSelected(null);
    setOpenIndex(null);
    setEditingIndex(null);
    // alternativeKey is the content identity; `alternatives` is read from that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alternativeKey]);
  const more = [
    explanation.trim(),
    alternatives.length > 0
      ? "These related directions can be taught that way. Open one, edit it if you want, and choose it to start a new intention. It is not the same result."
      : "",
    alternative
      ? `A related idea can be a new intention. It is not the same as the practical result. ${alternative}`
      : "",
  ].filter(Boolean);
  const selectedDraft = selected === null ? null : drafts[selected];
  const canContinue = selectedDraft !== null && draftReady(selectedDraft);

  const updateDraft = (index: number, patch: Partial<AltDraft>) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) => (draftIndex === index ? { ...draft, ...patch } : draft)),
    );
  };

  const choose = (index: number) => {
    const draft = drafts[index];
    if (!draft || !draftReady(draft) || busy) {
      return;
    }
    onUseIntention(toRecoveryPayload(draft));
  };

  return (
    <div className="recovery">
      <section className="caminos-h">
        <span className="paso-n">Step 1 of 4 · Your question</span>
        <h2>
          {alternatives.length > 0
            ? "Three ways into your question"
            : "This question cannot continue"}
        </h2>
        <div className="lo">
          <span className="lab">You wrote</span>
          <span>“{request.inputs.initial_intent}”</span>
        </div>
        <p className="porque">
          Auteur teaches through written text and narrated audio. This request asks for a
          result those formats cannot teach, so it cannot continue.
        </p>
        {more.length > 0 ? (
          <details className="porque-mas">
            <summary>Read more</summary>
            {more.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </details>
        ) : null}
      </section>
      {alternatives.length > 0 ? (
        <div className="caminos tres" role="radiogroup" aria-label="Suggested subjects">
          {alternatives.map((item, index) => (
            <RecoveryAlternativeCard
              key={`${item.title}-${index}`}
              item={item}
              index={index}
              draft={drafts[index] ?? draftFromAlternative(item)}
              selected={selected === index}
              open={openIndex === index}
              editing={editingIndex === index}
              busy={busy}
              onSelect={() => setSelected(index)}
              onToggle={() => {
                setSelected(index);
                setOpenIndex((current) => (current === index ? null : index));
              }}
              onEdit={() => setEditingIndex(index)}
              onChange={(patch) => updateDraft(index, patch)}
              onChoose={() => choose(index)}
            />
          ))}
        </div>
      ) : null}
      <div className="cierre-o">
        <div className="acciones">
          {alternatives.length > 0 ? (
            <button
              className="btn"
              type="button"
              disabled={busy || !canContinue}
              aria-busy={busy || undefined}
              onClick={() => {
                if (selected !== null) {
                  choose(selected);
                }
              }}
            >
              {busy ? "Working…" : "Review your goal"}
              {busy ? null : <span className="ar" aria-hidden="true" />}
            </button>
          ) : null}
          <ReformulateIntention busy={busy} onReset={onStartOver} />
          <span className="nota">
            {selected === null
              ? "Choose a folder to continue, or return to your question."
              : "This becomes a new intention. It is not the same result."}
          </span>
        </div>
        {busy ? (
          <div className="form-avisos">
            <GenerationStatus
              title="Reading your intention"
              description="Checking what can be taught through text and audio, and whether the learning object needs to be narrowed."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RecoveryAlternativeCard({
  item,
  index,
  draft,
  selected,
  open,
  editing,
  busy,
  onSelect,
  onToggle,
  onEdit,
  onChange,
  onChoose,
}: {
  item: RecoveryAlternative;
  index: number;
  draft: AltDraft;
  selected: boolean;
  open: boolean;
  editing: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onChange: (patch: Partial<AltDraft>) => void;
  onChoose: () => void;
}) {
  const fieldId = (name: string) => `recovery-${index}-${name}`;
  const ready = draftReady(draft);

  return (
    <div className={`lomo${selected ? " is-on" : ""}${open ? " abierta" : ""}`}>
      <button className="sol" type="button" onClick={onSelect}>
        <span className="n">{String(index + 1).padStart(2, "0")}</span>
        <span className="tt">{item.title}</span>
      </button>
      <div className="caja">
        <div className="abierto">
          <button className="pick" type="button" onClick={onSelect}>
            <b>{draft.initial_intent}</b>
            <span className="sint">{item.explanation}</span>
          </button>
          <button
            className="ver"
            type="button"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? "Hide details" : "View details"}
          </button>
          {open ? (
            <div className="mas">
              {editing ? (
                <div className="editor">
                  <label className="plano" htmlFor={fieldId("intent")}>
                    <span>What do you want to learn?</span>
                    <textarea
                      id={fieldId("intent")}
                      rows={3}
                      required
                      maxLength={MAX_FREE_TEXT_CHARS}
                      value={draft.initial_intent}
                      onChange={(event) => onChange({ initial_intent: event.target.value })}
                    />
                  </label>
                  <div className="niveles" role="radiogroup" aria-labelledby={fieldId("level")}>
                    <span className="editor-label" id={fieldId("level")}>
                      Your current level
                    </span>
                    {LEVELS.map((level) => (
                      <label className="niv" key={level}>
                        <input
                          type="radio"
                          name={fieldId("level")}
                          value={level}
                          checked={draft.experience_level === level}
                          onChange={() => onChange({ experience_level: level })}
                        />
                        <span className="c" aria-hidden="true" />
                        <b>{level}</b>
                        <small>{LEVEL_NOTES[level]}</small>
                      </label>
                    ))}
                  </div>
                  <label className="plano" htmlFor={fieldId("prior")}>
                    <span>Previous knowledge (optional)</span>
                    <textarea
                      id={fieldId("prior")}
                      rows={2}
                      maxLength={MAX_FREE_TEXT_CHARS}
                      value={draft.prior_knowledge}
                      onChange={(event) => onChange({ prior_knowledge: event.target.value })}
                    />
                  </label>
                  <label className="plano" htmlFor={fieldId("outcome")}>
                    <span>What do you want to be able to do or understand?</span>
                    <textarea
                      id={fieldId("outcome")}
                      rows={2}
                      required
                      maxLength={MAX_FREE_TEXT_CHARS}
                      value={draft.expected_outcome}
                      onChange={(event) => onChange({ expected_outcome: event.target.value })}
                    />
                  </label>
                </div>
              ) : (
                <dl>
                  <dt>Intention</dt>
                  <dd>{draft.initial_intent}</dd>
                  <dt>Level</dt>
                  <dd>{draft.experience_level}</dd>
                  <dt>Prior knowledge</dt>
                  <dd>{draft.prior_knowledge.trim() || "Not provided"}</dd>
                  <dt>Expected outcome</dt>
                  <dd>{draft.expected_outcome}</dd>
                </dl>
              )}
              {editing ? null : (
                <button className="edit" type="button" disabled={busy} onClick={onEdit}>
                  Edit
                </button>
              )}
            </div>
          ) : null}
          <div className="pie">
            <button
              className="marca"
              type="button"
              disabled={busy || !ready}
              onClick={selected ? onSelect : onChoose}
            >
              <span>{selected ? "Selected" : "Choose this path"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type PrecisionPanelProps = {
  request: LearningRequest;
  busy: boolean;
  onReset: () => void;
  onChoose: (payload: { option_id?: string; free_text?: string }) => void;
};

function PrecisionPanel({ request, busy, onChoose, onReset }: PrecisionPanelProps) {
  const [optionId, setOptionId] = useState<string>("");
  const [freeText, setFreeText] = useState("");
  const p = request.precision;
  const wrote = request.inputs.initial_intent.trim();

  return (
    <article className="refine">
      <div className="pasosf">
        <i className="fue" />
        <i className="hoy" />
        <i />
        <i />
      </div>

      <h1 className="t" id="precision-label">
        Where should we look closer?
      </h1>
      <p className="bajada">Choose a focus for your course.</p>
      {wrote ? (
        <blockquote className="cita-l">
          <span className="lab">You wrote</span>
          <span className="cita-q">{wrote}</span>
        </blockquote>
      ) : null}

      <div className="regla" />

      <div className="ops" role="radiogroup" aria-labelledby="precision-label">
        {p.options.map((option) => (
          <label className="op" key={option.id}>
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
            <span className="tx">
              <b>{option.title}</b>
              {option.explanation}
              {option.relation_to_intention ? <em>{option.relation_to_intention}</em> : null}
            </span>
          </label>
        ))}
      </div>

      {p.allows_free_text ? (
        <label className="campo">
          <span id="free-text-label">Or suggest a different focus</span>
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
      ) : null}

      <div className="regla" />
      <div className="acciones">
        <div className="pie-go">
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
          <ReformulateIntention busy={busy} onReset={onReset} />
        </div>
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
  onReset: () => void;
  onContinueToDirections: () => void;
  onConfirmWithChanges: (feedback: string) => void;
  onRevise: (feedback: string) => void;
};

function ObjectivePanel({
  request,
  busy,
  onReset,
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
        <div className="pie-go">
          <ReformulateIntention busy={busy} onReset={onReset} />
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
