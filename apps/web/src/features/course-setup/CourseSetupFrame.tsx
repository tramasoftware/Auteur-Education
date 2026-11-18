"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";

import { JourneyFrame, useJourneyStepValue } from "@/components/layout";
import { LandingFooter } from "@/features/landing/LandingFooter";
import "@/features/landing/landing.css";
import "@/features/onboarding/onboarding.css";

type CourseSetupFrameProps = {
  children: ReactNode;
  /** Right-hand screen title. Omitted on onboarding, where it follows the step. */
  title?: string;
  backHref?: string;
  backLabel?: string;
  backAriaLabel?: string;
  /** When false, the header keeps the slot and shows no control. */
  showBack?: boolean;
  /** Runs with the back link, for example to leave a loading overlay. */
  onBackClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  mainClassName?: string;
  screenClassName?: string;
  /** Public footer chrome; omitted during onboarding, proposals, and Blueprint. */
  showFooter?: boolean;
};

/**
 * Shared chrome for the course-setup sequence. The prototype repeats this
 * header and footer in each document; the label on the right and the back
 * link change with the screen.
 */
function ScreenTitle({ title }: { title?: string }) {
  const step = useJourneyStepValue();
  const resolvedTitle =
    title ??
    (!step || step.hidden || step.substepLabel === "Initial form"
      ? "Your question"
      : step.substepLabel);
  return <p className="donde">{resolvedTitle}</p>;
}

export function CourseSetupFrame({
  children,
  title,
  backHref = "/",
  backLabel = "Exit",
  backAriaLabel = "Exit course setup",
  showBack = true,
  onBackClick,
  mainClassName = "question-main",
  screenClassName,
  showFooter = false,
}: CourseSetupFrameProps) {
  return (
    <div className={`landing course-setup${screenClassName ? ` ${screenClassName}` : ""}`}>
      <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500&display=swap"
      />
      <JourneyFrame bare>
        <header className="topfix">
          <div className="top">
            {showBack ? (
              <Link
                className="back"
                href={backHref}
                aria-label={backAriaLabel}
                onClick={onBackClick}
              >
                <span className="ar izq" aria-hidden="true" />
                <span className="txt">{backLabel}</span>
              </Link>
            ) : (
              <span className="back" aria-hidden="true" />
            )}
            <Link className="marca" href="/" aria-label="Auteur Education">
              <span className="m1">Auteur</span>
              <span className="m2">Education</span>
            </Link>
            <ScreenTitle title={title} />
          </div>
        </header>
        <main className={mainClassName}>{children}</main>
        {showFooter ? <LandingFooter /> : null}
      </JourneyFrame>
    </div>
  );
}
