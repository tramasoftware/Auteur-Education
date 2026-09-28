type GenerationStatusProps = {
  title: string;
  description: string;
};

/** Honest wait for one real operation. Does not invent intermediate AI stages. */
export function GenerationStatus({ title, description }: GenerationStatusProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4"
    >
      <span
        aria-hidden
        className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-foreground motion-reduce:animate-none"
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {title}
          <span className="sr-only">. In progress.</span>
        </p>
        <p className="text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  );
}
