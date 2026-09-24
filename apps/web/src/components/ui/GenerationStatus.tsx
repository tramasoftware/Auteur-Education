type GenerationStatusProps = {
  title: string;
  description: string;
};

/** Honest wait for one real operation. Does not invent intermediate AI stages. */
export function GenerationStatus({ title, description }: GenerationStatusProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <span
        aria-hidden
        className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-950 motion-reduce:animate-none dark:border-zinc-700 dark:border-t-zinc-50"
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {title}
          <span className="sr-only">. In progress.</span>
        </p>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
    </div>
  );
}
