import "./generation-status.css";

type GenerationStatusProps = {
  title: string;
  description: string;
};

/** Inline wait for one real operation. One line of copy, no invented percent. */
export function GenerationStatus({ title, description }: GenerationStatusProps) {
  return (
    <div role="status" className="ae-wait">
      <span className="ae-wait-spin" aria-hidden />
      <p className="ae-wait-title">
        {title}
        <span className="sr-only">. In progress.</span>
      </p>
      <p className="ae-wait-text">{description}</p>
    </div>
  );
}

/** Shown while the app checks whether a course build is already running. */
export function CheckingGenerationStatus() {
  return (
    <div className="ae-status-check">
      <GenerationStatus
        title="Checking generation status"
        description="Seeing whether a course is already being built."
      />
    </div>
  );
}
