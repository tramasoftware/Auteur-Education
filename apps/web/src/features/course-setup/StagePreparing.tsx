"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { CourseSetupFrame } from "./CourseSetupFrame";

import "./stage-preparing.css";

type StagePreparingProps = {
  frameTitle: string;
  backHref: string;
  backLabel: string;
  backAriaLabel: string;
  heading: string;
  readyHeading: string;
  phases: readonly string[];
  /**
   * Ease the bar toward 94% across this many milliseconds. Chosen to sit near
   * a typical successful call. The API does not report a percent.
   */
  approachMs: number;
  /** After approachMs, crawl the last stretch if the request is still running. */
  crawlMs?: number;
  ready: boolean;
  actionLabel: string;
  onContinue: () => void;
};

/**
 * Full-screen wait between course-setup stages. Same bar behavior as the
 * course preparation screen: approach a typical duration, then creep if the
 * backend is still working, and reveal the next action only when it returns.
 */
export function StagePreparing({
  frameTitle,
  backHref,
  backLabel,
  backAriaLabel,
  heading,
  readyHeading,
  phases,
  approachMs,
  crawlMs = 14000,
  ready,
  actionLabel,
  onContinue,
}: StagePreparingProps) {
  const barLock = useRef(false);
  const readyRef = useRef(ready);
  const [phase, setPhase] = useState(phases[0] ?? "");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    readyRef.current = ready;
    if (ready) {
      barLock.current = true;
    }
  }, [ready]);

  useEffect(() => {
    if (ready || phases.length === 0) {
      return;
    }
    const step = approachMs / phases.length;
    const started = performance.now();
    const timer = window.setInterval(() => {
      if (readyRef.current) {
        return;
      }
      const index = Math.min(
        phases.length - 1,
        Math.floor((performance.now() - started) / step),
      );
      setPhase(phases[index] ?? "");
    }, 200);
    return () => window.clearInterval(timer);
  }, [ready, approachMs, phases]);

  useEffect(() => {
    if (ready) {
      return;
    }
    const started = performance.now();
    const timer = window.setInterval(() => {
      if (barLock.current || readyRef.current) {
        return;
      }
      const elapsed = performance.now() - started;
      if (elapsed < approachMs) {
        const eased = 1 - (1 - elapsed / approachMs) ** 2.2;
        setProgress(Math.min(94, Math.round(eased * 94)));
        return;
      }
      const extra = Math.min(4, ((elapsed - approachMs) / crawlMs) * 4);
      setProgress(Math.min(98, Math.round(94 + extra)));
    }, 200);
    return () => window.clearInterval(timer);
  }, [ready, approachMs, crawlMs]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return createPortal(
    <div className="stage-preparing-overlay">
      <CourseSetupFrame
        screenClassName="stage-preparing-screen"
        mainClassName="stage-preparing-main"
        title={frameTitle}
        backHref={backHref}
        backLabel={backLabel}
        backAriaLabel={backAriaLabel}
      >
        <section className={ready ? "gen listo" : "gen"} aria-busy={!ready}>
          <div>
            <h1>{ready ? readyHeading : heading}</h1>
            <div className="reg" aria-live="polite">
              <p className="act">{phase}</p>
            </div>
            <div className="avance">
              <span className="via">
                <i style={{ width: `${progress}%` }} />
              </span>
              <span className="pc">{progress}%</span>
            </div>
            {ready ? (
              <div className="acciones">
                <button className="btn" type="button" onClick={onContinue}>
                  {actionLabel}
                  <span className="ar" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </CourseSetupFrame>
    </div>,
    document.body,
  );
}

export const PROPOSAL_PHASES = [
  "Reading the confirmed objective…",
  "Separating different ways into the subject…",
  "Checking that each path is distinct…",
  "Writing what each path includes and leaves out…",
] as const;

/** One structured proposal call. The bar reaches the end zone around a typical reply. */
export const PROPOSAL_APPROACH_MS = 45_000;

export const BLUEPRINT_PHASES = [
  "Reading the path you chose…",
  "Ordering the modules…",
  "Planning what each lesson is for…",
  "Writing the pedagogical contract…",
] as const;

/** Blueprint generation runs in the background and is usually slower than proposals. */
export const BLUEPRINT_APPROACH_MS = 75_000;
