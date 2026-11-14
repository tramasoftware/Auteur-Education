"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";

import { onboardingJourneyStep, proposalsJourneyStep, useJourneyStep } from "@/components/layout";
import {
  CheckingGenerationStatus,
  DefinitionList,
  ErrorNotice,
  GenerationStatus,
  StatusBadge,
} from "@/components/ui";
import {
  PROPOSAL_APPROACH_MS,
  PROPOSAL_PHASES,
  StagePreparing,
} from "@/features/course-setup/StagePreparing";
import { CourseStepLabel } from "@/features/course-setup/CourseStepLabel";
import { StageFailure, stageFailureCopy } from "@/features/course-setup/StageFailure";
import { useRedirectIfActiveBuild } from "@/hooks/useRedirectIfActiveBuild";
import { ApiError, generateDirectionsOnce, learningRequests } from "@/lib/api";
import { requestStateLabel } from "@/lib/labels";
import {
  beginNewIntention,
  forgetOnboardingDraft,
  peekLearningRequest,
  recallOnboardingDraft,
  rememberLearningRequest,
  rememberOnboardingDraft,
  subscribeOnboardingDraft,
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
 * and learning-object precision when needed. The objective is formulated
 * during the learning-paths wait (DEC-021).
 */
export function OnboardingFeature() {
  const params = useSearchParams();
  const sessionKey =
    params.get("new") === "1" ? "new" : (params.get("request") ?? "blank");
  return <OnboardingSession key={sessionKey} />;
}

function OnboardingSession() {
  const router = useRouter();
  const params = useSearchParams();
  const paramRequestId = params.get("request");
  const startingFresh = params.get("new") === "1";
  const blockingActiveBuild = useRedirectIfActiveBuild();
  const [request, setRequest] = useState<LearningRequest | null>(() =>
    startingFresh || !paramRequestId ? null : peekLearningRequest(paramRequestId),
  );
  const [resumeMiss, setResumeMiss] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preparingDirections, setPreparingDirections] = useState(false);
  const [leftWait, setLeftWait] = useState(() => params.get("hold") === "1");
  const [directionsReady, setDirectionsReady] = useState(false);
  const [directionsHref, setDirectionsHref] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [failure, setFailure] = useState<(typeof stageFailureCopy)[keyof typeof stageFailureCopy] | null>(
    null,
  );
  const retryRef = useRef<() => void>(() => {});
  const holdDirections = params.get("hold") === "1";
  const holdRef = useRef(holdDirections);
  const showPrecision =
    request?.state === "precision_required" ||
    (leftWait && Boolean(request?.precision.needs_precision));
  const awaitingDirections = Boolean(
    request &&
      !request.proposals &&
      (request.state === "objective_confirmation" ||
        request.state === "objective_confirmed"),
  );
  const showDirectionsOverlay =
    !failure &&
    !leftWait &&
    (preparingDirections || awaitingDirections || directionsReady);

  useJourneyStep(
    showDirectionsOverlay
      ? proposalsJourneyStep(request)
      : onboardingJourneyStep(request, showPrecision),
  );

  useLayoutEffect(() => {
    if (!startingFresh) {
      return;
    }
    beginNewIntention();
    router.replace("/onboarding");
  }, [router, startingFresh]);

  useEffect(() => {
    // A new intention does not resume a stored request. Back navigation uses ?request=.
    if (startingFresh || !paramRequestId || request) {
      return;
    }
    let cancelled = false;
    learningRequests.get(paramRequestId).then(
      (next) => {
        if (!cancelled) {
          rememberLearningRequest(next);
          setRequest(next);
        }
      },
      () => {
        if (!cancelled) {
          beginNewIntention();
          setResumeMiss(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [paramRequestId, request, startingFresh]);

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
      rememberLearningRequest(next);
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

  const requestId = request?.id ?? null;
  const requestState = request?.state ?? null;
  const hasProposals = Boolean(request?.proposals);
  const precisionKey = request?.selected_precision
    ? `${request.selected_precision.option_id ?? ""}:${request.selected_precision.free_text ?? ""}`
    : "";

  useEffect(() => {
    if (!requestId || holdDirections) {
      return;
    }
    if (hasProposals && requestState !== "objective_confirmed") {
      router.push(`/proposals?request=${requestId}`);
      return;
    }
    if (
      requestState !== "objective_confirmation" &&
      requestState !== "objective_confirmed"
    ) {
      return;
    }
    const key = `${requestState}:${precisionKey}`;
    let cancelled = false;
    holdRef.current = holdDirections;
    void generateDirectionsOnce(requestId, key).then(
      (next) => {
        if (cancelled) {
          return;
        }
        rememberLearningRequest(next);
        setRequest(next);
        if (holdRef.current) {
          setPreparingDirections(false);
          return;
        }
        setFailure(null);
        setDirectionsHref(`/proposals?request=${next.id}`);
        setDirectionsReady(true);
      },
      () => {
        if (cancelled) {
          return;
        }
        retryRef.current = () => {
          setPreparingDirections(true);
          setFailure(null);
          void generateDirectionsOnce(requestId, `${key}:retry-${Date.now()}`).then(
            (next) => {
              rememberLearningRequest(next);
              setRequest(next);
              if (holdRef.current) {
                setPreparingDirections(false);
                return;
              }
              setDirectionsHref(`/proposals?request=${next.id}`);
              setDirectionsReady(true);
            },
            () => {
              setPreparingDirections(false);
              setDirectionsReady(false);
              setFailure(stageFailureCopy.directions);
            },
          );
        };
        setPreparingDirections(false);
        setDirectionsReady(false);
        setFailure(stageFailureCopy.directions);
        setError(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasProposals, holdDirections, precisionKey, requestId, requestState, router]);

  const chooseFocus = async (payload: { option_id?: string; free_text?: string }) => {
    if (!request) {
      return;
    }
    setError(null);
    setFailure(null);
    setDirectionsReady(false);
    holdRef.current = false;
    setLeftWait(false);
    setPreparingDirections(true);
    try {
      const chosen = await learningRequests.choosePrecision(request.id, payload);
      forgetOnboardingDraft();
      rememberLearningRequest(chosen);
      setRequest(chosen);
      router.replace(`/onboarding?request=${chosen.id}`);
    } catch {
      retryRef.current = () => {
        void chooseFocus(payload);
      };
      setPreparingDirections(false);
      setFailure(stageFailureCopy.precision);
      setError(null);
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
    beginNewIntention();
    // Full navigation resets client state; client routing alone left stale onboarding UI.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional demo reset
    window.location.assign("/onboarding");
  };

  if (blockingActiveBuild) {
    return <CheckingGenerationStatus />;
  }

  if (!startingFresh && paramRequestId && !request && !resumeMiss) {
    return (
      <div className="ae-status-check">
        <GenerationStatus
          title="Opening your question"
          description="Loading the intention you already started."
        />
      </div>
    );
  }

  const directionsScreen = showDirectionsOverlay ? (
    <StagePreparing
      frameTitle="Your learning path"
      backHref={
        request ? `/onboarding?request=${request.id}&hold=1` : "/onboarding"
      }
      backLabel={request?.precision.needs_precision ? "Refine your subject" : "Onboarding"}
      backAriaLabel={
        request?.precision.needs_precision
          ? "Back to your focus"
          : "Back to onboarding"
      }
      heading="Your learning paths are taking shape"
      readyHeading="Your learning paths are ready"
      phases={PROPOSAL_PHASES}
      approachMs={PROPOSAL_APPROACH_MS}
      ready={directionsReady}
      onBackClick={() => {
        holdRef.current = true;
        setLeftWait(true);
        setPreparingDirections(false);
      }}
      onContinue={() => {
        if (directionsHref) {
          router.push(directionsHref);
        }
      }}
    />
  ) : null;

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
      {directionsScreen}
      <article className="lect" hidden={failure ? true : undefined} inert={failure ? true : undefined}>
        <CourseStepLabel step={1} label="Onboarding" />
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
    {directionsScreen}
    <div className="flex flex-col gap-8" hidden={failure ? true : undefined} inert={failure ? true : undefined}>
      {request.state === "incompatible" || showPrecision || showDirectionsOverlay ? null : (
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

      {showPrecision ? (
        <PrecisionPanel
          request={request}
          busy={preparingDirections}
          onReset={resetFromScratch}
          onChoose={(payload) => {
            void chooseFocus(payload);
          }}
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

  const persistDraft = (
    nextIntent: string,
    nextLevel: ExperienceLevel,
    nextPrior: string,
    nextOutcome: string,
  ) => {
    rememberOnboardingDraft({
      initial_intent: nextIntent,
      experience_level: nextLevel,
      prior_knowledge: nextPrior.trim() || null,
      expected_outcome: nextOutcome,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
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
            onChange={(e) => {
              const value = e.target.value;
              setIntent(value);
              persistDraft(value, levelValue, priorValue, outcomeValue);
            }}
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
            onChange={(e) => {
              const value = e.target.value;
              setOutcome(value);
              persistDraft(intentValue, levelValue, priorValue, value);
            }}
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
                onChange={() => {
                  setLevel(option);
                  persistDraft(intentValue, option, priorValue, outcomeValue);
                }}
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
              onChange={(e) => {
                const value = e.target.value;
                setPrior(value);
                persistDraft(intentValue, levelValue, value, outcomeValue);
              }}
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

      {busy ? (
        <div className="pie-espera">
          <GenerationStatus
            title="Reading your intention"
            description="Checking what you want to learn and whether text and audio can teach it."
          />
        </div>
      ) : (
        <div className="acciones pie-l">
          <button
            className="btn"
            type="submit"
            disabled={!intentValue.trim() || !outcomeValue.trim()}
          >
            Analyze my intention
            <span className="ar" aria-hidden="true" />
          </button>
        </div>
      )}
      {formNotice ? (
        <div className="form-avisos">
          <ErrorNotice error={error} />
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
        <CourseStepLabel label="Suggested subjects" tight />
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
            />
          ))}
        </div>
      ) : null}
      <div className="cierre-o">
        {busy ? (
          <GenerationStatus
            title="Reading your intention"
            description="Checking what you want to learn and whether text and audio can teach it."
          />
        ) : (
          <div className="acciones">
            {alternatives.length > 0 ? (
              <button
                className="btn"
                type="button"
                disabled={!canContinue}
                onClick={() => {
                  if (selected !== null) {
                    choose(selected);
                  }
                }}
              >
                Review your goal
                <span className="ar" aria-hidden="true" />
              </button>
            ) : null}
            <ReformulateIntention busy={busy} onReset={onStartOver} />
            <span className="nota">
              {selected === null
                ? "Choose a folder to continue, or return to your question."
                : "This becomes a new intention. It is not the same result."}
            </span>
          </div>
        )}
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
              aria-pressed={selected}
              onClick={onSelect}
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
      <CourseStepLabel label="Refine your subject" />

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
            onClick={() =>
              onChoose(optionId ? { option_id: optionId } : { free_text: freeText.trim() })
            }
          >
            See learning paths
            <span className="ar" aria-hidden="true" />
          </button>
          <ReformulateIntention busy={busy} onReset={onReset} />
        </div>
      </div>
    </article>
  );
}
