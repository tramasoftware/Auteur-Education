"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { BlueprintState, LearningRequest } from "@/types/generator";

export type JourneyStage = "onboarding" | "proposals" | "blueprint";

export type JourneyStep = {
  stage: JourneyStage;
  substepIndex: number;
  substepCount: number;
  substepLabel: string;
  /** Hidden on the initial intention form, before a request exists. */
  hidden?: boolean;
};

const STAGES: { id: JourneyStage; label: string }[] = [
  { id: "onboarding", label: "Onboarding" },
  { id: "proposals", label: "Proposals" },
  { id: "blueprint", label: "Blueprint" },
];

/** UF-01/UF-02. Precision is omitted when the request never requires it. */
export function onboardingJourneyStep(request: LearningRequest | null): JourneyStep {
  if (!request) {
    return {
      stage: "onboarding",
      substepIndex: 0,
      substepCount: 2,
      substepLabel: "Initial form",
      hidden: true,
    };
  }

  if (request.state === "draft" || request.state === "incompatible") {
    return {
      stage: "onboarding",
      substepIndex: 0,
      substepCount: 2,
      substepLabel: "Initial form",
    };
  }

  const includesPrecision =
    request.state === "precision_required" ||
    request.precision.needs_precision ||
    request.selected_precision !== null;

  if (request.state === "precision_required") {
    return {
      stage: "onboarding",
      substepIndex: 1,
      substepCount: 3,
      substepLabel: "Learning object",
    };
  }

  if (includesPrecision) {
    return {
      stage: "onboarding",
      substepIndex: 2,
      substepCount: 3,
      substepLabel: "Learning objective",
    };
  }

  return {
    stage: "onboarding",
    substepIndex: 1,
    substepCount: 2,
    substepLabel: "Learning objective",
  };
}

/** UF-03. Hidden only on the empty invite; visible once a request is in progress. */
export function proposalsJourneyStep(request: LearningRequest | null): JourneyStep {
  if (!request) {
    return {
      stage: "proposals",
      substepIndex: 0,
      substepCount: 3,
      substepLabel: "Generating directions",
      hidden: true,
    };
  }
  if (!request.proposals) {
    return {
      stage: "proposals",
      substepIndex: 0,
      substepCount: 3,
      substepLabel: "Generating directions",
    };
  }
  if (request.selected_proposal_id) {
    return {
      stage: "proposals",
      substepIndex: 2,
      substepCount: 3,
      substepLabel: "Direction selected",
    };
  }
  return {
    stage: "proposals",
    substepIndex: 1,
    substepCount: 3,
    substepLabel: "Choose a direction",
  };
}

/** Blueprint review. Failed stays on review so the learner can return and try again. */
export function blueprintJourneyStep(state: BlueprintState | null): JourneyStep {
  if (state === "approved") {
    return {
      stage: "blueprint",
      substepIndex: 2,
      substepCount: 3,
      substepLabel: "Approved",
    };
  }
  if (state === "awaiting_approval" || state === "failed") {
    return {
      stage: "blueprint",
      substepIndex: 1,
      substepCount: 3,
      substepLabel: "Review",
    };
  }
  return {
    stage: "blueprint",
    substepIndex: 0,
    substepCount: 3,
    substepLabel: "Drafting the contract",
  };
}

function defaultStep(pathname: string): JourneyStep {
  if (pathname.startsWith("/blueprints")) {
    return blueprintJourneyStep(null);
  }
  if (pathname.startsWith("/proposals")) {
    return proposalsJourneyStep(null);
  }
  return onboardingJourneyStep(null);
}

const JourneyStepContext = createContext<Dispatch<SetStateAction<JourneyStep | null>> | null>(
  null,
);

export function useJourneyStep(step: JourneyStep) {
  const setStep = useContext(JourneyStepContext);
  const { stage, substepIndex, substepCount, substepLabel, hidden } = step;
  useEffect(() => {
    setStep?.({ stage, substepIndex, substepCount, substepLabel, hidden });
  }, [setStep, stage, substepIndex, substepCount, substepLabel, hidden]);
}

export function JourneyProgress({ step }: { step: JourneyStep }) {
  const stageIndex = Math.max(0, STAGES.findIndex((stage) => stage.id === step.stage));
  const stageLabel = STAGES[stageIndex].label;

  return (
    <div
      className="sticky top-0 z-10 -mx-6 border-b border-line bg-background px-6 py-3"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={STAGES.length}
      aria-valuenow={stageIndex + 1}
      aria-valuetext={`${stageLabel}: ${step.substepLabel}`}
    >
      <div className="flex w-full gap-3">
        {STAGES.map((stage, index) => {
          const fill =
            index < stageIndex
              ? 1
              : index > stageIndex
                ? 0
                : (step.substepIndex + 1) / step.substepCount;
          const current = index === stageIndex;
          return (
            <div key={stage.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-line"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${Math.round(fill * 100)}%` }}
                />
              </div>
              <span
                className={`truncate text-xs ${
                  current ? "font-medium text-foreground" : "text-muted"
                }`}
              >
                {stage.label}
                {current ? (
                  <span className="sr-only">, current, {step.substepLabel}</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-xs font-medium tracking-wide text-muted uppercase">
          Current step
        </span>
        <span className="text-base font-semibold text-foreground">
          {step.substepLabel}
        </span>
      </p>
    </div>
  );
}

type JourneyFrameProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function JourneyFrame({ title, description, children }: JourneyFrameProps) {
  const pathname = usePathname();
  const [step, setStep] = useState<JourneyStep | null>(null);
  const shown = step ?? defaultStep(pathname);

  return (
    <JourneyStepContext.Provider value={setStep}>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-6 py-8">
        {shown.hidden ? null : <JourneyProgress step={shown} />}
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted">{description}</p>
        ) : null}
        {children}
      </main>
    </JourneyStepContext.Provider>
  );
}
