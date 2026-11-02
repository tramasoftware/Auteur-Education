"use client";

export type StageFailureCopy = {
  title: string;
  body: string;
  backLabel: string;
};

/** Screen 14, with copy for the load that failed. No codes or provider text. */
export const stageFailureCopy = {
  intention: {
    title: "Your focus isn’t ready yet",
    body: "Your answers are saved. Try reading your intention again.",
    backLabel: "Back to your question",
  },
  suggested: {
    title: "Your focus isn’t ready yet",
    body: "Your answers are saved. Try reading your intention again.",
    backLabel: "Back to suggested subjects",
  },
  precision: {
    title: "Your objective isn’t ready yet",
    body: "Your focus is saved. Try formulating the objective again.",
    backLabel: "Back to your focus",
  },
  directions: {
    title: "Your learning directions aren’t ready yet",
    body: "Your objective is saved. Try preparing them again.",
    backLabel: "Back to your objective",
  },
  blueprint: {
    title: "Your Blueprint isn’t ready yet",
    body: "Your learning path is saved. Try preparing the Blueprint again.",
    backLabel: "Choose another path",
  },
  course: {
    title: "Your course isn’t ready yet",
    body: "Your answers are saved. Try preparing the course again.",
    backLabel: "Choose another path",
  },
} as const satisfies Record<string, StageFailureCopy>;

export function StageFailure({
  title,
  body,
  backLabel,
  busy = false,
  onRetry,
  onBack,
}: StageFailureCopy & {
  busy?: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <article className="stage-failure" role="alert">
      <span className="lomo" aria-hidden="true" />
      <svg
        className="ico"
        viewBox="0 0 44 44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
      >
        <circle cx="22" cy="22" r="20" />
        <path d="M22 12v13M22 30.5v1" strokeLinecap="round" />
      </svg>
      <h1>{title}</h1>
      <p>{body}</p>
      <div className="acciones">
        <button
          className="btn"
          type="button"
          onClick={onRetry}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          Try again
          <span className="ar" aria-hidden="true" />
        </button>
        <button className="btn fantasma" type="button" onClick={onBack} disabled={busy}>
          {backLabel}
        </button>
      </div>
    </article>
  );
}
