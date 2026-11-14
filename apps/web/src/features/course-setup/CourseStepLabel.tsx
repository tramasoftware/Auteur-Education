import "./course-step.css";

/** Fixed course-setup steps: onboarding, then learning path (DEC-022). */
export const COURSE_STEP_TOTAL = 2;

type CourseStepLabelProps = {
  /** Omitted on screens whose place in the path depends on the intention. */
  step?: number;
  label: string;
  /** Sits directly above a heading, so the gap stays short. */
  tight?: boolean;
};

export function CourseStepLabel({ step, label, tight = false }: CourseStepLabelProps) {
  const text = step ? `Step ${step} of ${COURSE_STEP_TOTAL} · ${label}` : label;
  return <p className={tight ? "course-step course-step--tight" : "course-step"}>{text}</p>;
}
