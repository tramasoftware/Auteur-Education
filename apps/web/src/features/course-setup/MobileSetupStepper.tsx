"use client";

import { useJourneyStepValue } from "@/components/layout";

import { COURSE_STEP_TOTAL } from "./CourseStepLabel";

/** Course-setup macro steps (UF-01 → Blueprint), aligned with CourseStepLabel. */
const COURSE_STEPS = [
  { id: "question", label: "Your question" },
  { id: "objective", label: "Objective" },
  { id: "path", label: "Learning path" },
  { id: "blueprint", label: "Blueprint" },
] as const;

function activeCourseStepIndex(
  step: ReturnType<typeof useJourneyStepValue>,
): number {
  if (!step) {
    return 0;
  }
  if (step.stage === "blueprint") {
    return 3;
  }
  if (step.stage === "proposals") {
    return 2;
  }
  if (step.substepLabel === "Your objective") {
    return 1;
  }
  return 0;
}

/** Numbered setup steps. Hidden from 921px up so the desktop progress bar is untouched. */
export function MobileSetupStepper() {
  const step = useJourneyStepValue();
  const activeIndex = activeCourseStepIndex(step);

  return (
    <nav
      className="ae-v9-steps"
      aria-label="Course setup progress"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={COURSE_STEP_TOTAL}
      aria-valuenow={activeIndex + 1}
      aria-valuetext={`Step ${activeIndex + 1} of ${COURSE_STEP_TOTAL}: ${COURSE_STEPS[activeIndex].label}`}
    >
      <ol>
        {COURSE_STEPS.map((stage, index) => {
          const state =
            index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming";
          return (
            <li
              key={stage.id}
              className={state}
              aria-current={state === "current" ? "step" : undefined}
            >
              <b>{state === "complete" ? "✓" : index + 1}</b>
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
