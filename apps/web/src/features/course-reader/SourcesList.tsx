import type { SourceView } from "@/types/generator";

/** BR-SRC-008: the sources actually used, with their verification status. */
export function SourcesList({ sources }: { sources: SourceView[] }) {
  if (sources.length === 0) {
    return <p className="text-sm text-zinc-500">No sources listed.</p>;
  }
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {sources.map((source) => (
        <li key={source.ref} className="leading-6">
          <span className="font-mono text-xs text-zinc-500">{source.ref}</span>{" "}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium underline underline-offset-4"
          >
            {source.title}
          </a>
          {source.author_or_institution ? ` — ${source.author_or_institution}` : ""}
          {source.date ? ` (${source.date})` : ""}
          <span className="text-zinc-500">
            {" "}
            · {source.source_type.replace("_", " ")} · {source.role.replace("_", " ")}
            {source.verification === "unverified" ? " · not verified by search" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
