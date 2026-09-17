"use client";

import { useEffect, useState } from "react";

import { ApiError, courses } from "@/lib/api";
import type { CourseDiagnostics } from "@/types/generator";

/**
 * DEC-005: demo-only observability. Hidden automatically when the backend does
 * not expose diagnostics (production).
 */
export function DiagnosticsPanel({
  courseId,
  refreshKey,
}: {
  courseId: string;
  refreshKey: string;
}) {
  const [data, setData] = useState<CourseDiagnostics | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (hidden) {
      return;
    }
    courses
      .getDiagnostics(courseId)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setHidden(true);
        }
      });
  }, [courseId, refreshKey, hidden]);

  if (hidden || !data) {
    return null;
  }

  const seconds = Math.round(data.trace_summary.total_duration_ms / 1000);

  return (
    <details className="rounded-md border border-dashed border-zinc-300 p-4 text-sm dark:border-zinc-700">
      <summary className="cursor-pointer font-medium">
        Generation diagnostics (demo) — {data.trace_summary.calls} model calls,{" "}
        {seconds}s, {data.trace_summary.usage.total_tokens.toLocaleString()} tokens
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <div className="grid gap-1 sm:grid-cols-2">
          <p>
            Model: <span className="font-mono">{data.model}</span>
          </p>
          <p>Failed or retried calls: {data.trace_summary.failed_calls}</p>
          <p>
            Input tokens: {data.trace_summary.usage.input_tokens.toLocaleString()}
          </p>
          <p>
            Output tokens: {data.trace_summary.usage.output_tokens.toLocaleString()}
            {data.trace_summary.usage.reasoning_tokens
              ? ` (reasoning ${data.trace_summary.usage.reasoning_tokens.toLocaleString()})`
              : ""}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="font-medium">
            Materialist criterion: {data.blueprint_internal.materialist_classification}
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            {data.blueprint_internal.materialist_justification}
          </p>
          {data.blueprint_internal.structure_deviation_reasons ? (
            <p className="text-zinc-600 dark:text-zinc-400">
              Structure deviation: {data.blueprint_internal.structure_deviation_reasons}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-medium">Per lesson</p>
          <ul className="flex flex-col gap-1">
            {data.modules.flatMap((m) =>
              m.lessons.map((l) => (
                <li key={l.id} className="leading-6">
                  <span className="font-medium">{m.title}</span> › {l.title}:{" "}
                  {l.state}, {l.attempts} attempt(s), {l.research_rounds} research
                  round(s), {l.evidence_retrieved}/{l.evidence_total} sources verified,
                  ~{l.word_count} words
                  {l.review_result ? `, review ${l.review_result}` : ""}
                  {l.review_issues.length > 0 ? ` — ${l.review_issues.join("; ")}` : ""}
                </li>
              )),
            )}
          </ul>
        </div>

        {data.modules.some((m) => m.audit) ? (
          <div className="flex flex-col gap-1">
            <p className="font-medium">Module audits</p>
            {data.modules
              .filter((m) => m.audit)
              .map((m) => (
                <p key={m.id} className="leading-6">
                  {m.title}: {m.audit!.result}
                  {m.audit!.issues.length > 0 ? ` — ${m.audit!.issues.join("; ")}` : ""}
                </p>
              ))}
          </div>
        ) : null}

        {data.course_audit ? (
          <p>
            Course audit: {data.course_audit.result}
            {data.course_audit.issues.length > 0
              ? ` — ${data.course_audit.issues.join("; ")}`
              : ""}
          </p>
        ) : null}

        <div className="flex flex-col gap-1">
          <p className="font-medium">Stage trace</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-zinc-500">
                  <th className="py-1 pr-3">Stage</th>
                  <th className="py-1 pr-3">Target</th>
                  <th className="py-1 pr-3">Attempt</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">ms</th>
                  <th className="py-1 pr-3">Tokens</th>
                  <th className="py-1 pr-3">Search</th>
                  <th className="py-1 pr-3">Codes / QA</th>
                </tr>
              </thead>
              <tbody>
                {data.traces.map((t, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="py-1 pr-3 font-mono">{t.stage}</td>
                    <td className="py-1 pr-3 font-mono">{t.target}</td>
                    <td className="py-1 pr-3">{t.attempt}</td>
                    <td className="py-1 pr-3">{t.status}</td>
                    <td className="py-1 pr-3">{t.duration_ms}</td>
                    <td className="py-1 pr-3">{t.usage.total_tokens}</td>
                    <td className="py-1 pr-3">{t.web_search ? "yes" : ""}</td>
                    <td className="py-1 pr-3">
                      {[...t.validation_codes, t.qa_result ?? ""].filter(Boolean).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  );
}
