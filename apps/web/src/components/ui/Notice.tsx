import type { ReactNode } from "react";

import { ApiError } from "@/lib/api";

type NoticeProps = {
  tone?: "info" | "error" | "success";
  title?: string;
  children: ReactNode;
};

const tones = {
  info: "border-line bg-surface text-foreground",
  error: "border-red-200 bg-red-100 text-red-900",
  success: "border-emerald-200 bg-surface text-emerald-900",
};

export function Notice({ tone = "info", title, children }: NoticeProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${tones[tone]}`}
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
