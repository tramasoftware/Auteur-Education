"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";
import { learningRequests } from "@/lib/api";
import { peekLearningRequest, rememberLearningRequest } from "@/lib/session";
import type { LearningRequest } from "@/types/generator";

import "./proposals.css";

function useLearningRequest(requestId: string | null): LearningRequest | null {
  const cached = requestId ? peekLearningRequest(requestId) : null;
  const [fetched, setFetched] = useState<LearningRequest | null>(null);

  useEffect(() => {
    if (!requestId || peekLearningRequest(requestId)) {
      return;
    }
    let cancelled = false;
    learningRequests.get(requestId).then(
      (next) => {
        if (cancelled) {
          return;
        }
        rememberLearningRequest(next);
        setFetched(next);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (cached) {
    return cached;
  }
  return fetched?.id === requestId ? fetched : null;
}

export function ProposalsScreen({ children }: { children: ReactNode }) {
  const router = useRouter();
  const requestId = useSearchParams().get("request");
  const request = useLearningRequest(requestId);
  const [confirmBack, setConfirmBack] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const canRevisePrecision =
    request?.precision.needs_precision === true &&
    (request.state === "proposals_ready" || request.state === "proposal_selected");
  const reviseHref = requestId
    ? `/onboarding?request=${requestId}&revise=precision`
    : "/onboarding";

  useEffect(() => {
    if (!confirmBack) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setConfirmBack(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmBack]);

  return (
    <CourseSetupFrame
      title="Your learning path"
      showBack={canRevisePrecision}
      backHref={reviseHref}
      backLabel="Back"
      backAriaLabel="Back to your focus"
      onBackClick={(event) => {
        event.preventDefault();
        setConfirmBack(true);
      }}
      mainClassName="paths-main"
      screenClassName="proposals-screen"
    >
      {children}
      {confirmBack ? (
        <div className="reform-modal">
          <button
            className="reform-backdrop"
            type="button"
            aria-label="Close dialog"
            onClick={() => setConfirmBack(false)}
          />
          <div
            className="reform-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
          >
            <h2 id={titleId}>Change your focus?</h2>
            <p id={descriptionId}>
              Another focus replaces these learning paths. The same focus keeps the
              paths you already have.
            </p>
            <div className="acciones">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setConfirmBack(false);
                  router.push(reviseHref);
                }}
              >
                Choose another focus
              </button>
              <button
                className="btn fantasma"
                type="button"
                onClick={() => setConfirmBack(false)}
              >
                Keep these paths
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </CourseSetupFrame>
  );
}
