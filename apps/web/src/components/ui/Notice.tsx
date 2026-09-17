import type { ReactNode } from "react";

import { ApiError } from "@/lib/api";

type NoticeProps = {
  tone?: "info" | "error" | "success";
  title?: string;
  children: ReactNode;
};

const tones = {
  info: "border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  error:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
};

export function Notice({ tone = "info", title, children }: NoticeProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-md border px-4 py-3 text-sm leading-6 ${tones[tone]}`}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  if (error instanceof ApiError) {
    return (
      <Notice tone="error" title={titleFor(error)}>
        <p>{error.message}</p>
        {error.details.length > 0 ? (
          <ul className="mt-1 list-disc pl-5">
            {error.details.map((d, i) => (
              <li key={i}>
                {d.field ? <span className="font-mono">{d.field}: </span> : null}
                {d.issue}
              </li>
            ))}
          </ul>
        ) : null}
        {error.supportReference ? (
          <p className="mt-1 text-xs opacity-70">
            Reference: <span className="font-mono">{error.supportReference}</span>
          </p>
        ) : null}
      </Notice>
    );
  }
  return (
    <Notice tone="error" title="Something went wrong">
      <p>{error instanceof Error ? error.message : String(error)}</p>
    </Notice>
  );
}

function titleFor(error: ApiError): string {
  switch (error.code) {
    case "non_english_input":
      return "English only";
    case "validation_error":
      return "Please review the form";
    case "stale_version":
      return "This version changed";
    case "invalid_state":
      return "Not available in the current step";
    case "provider_unavailable":
      return "Generation service unavailable";
    case "generation_failed":
      return "Generation did not produce a valid result";
    case "network_error":
      return "Cannot reach the API";
    default:
      return "Something went wrong";
  }
}
