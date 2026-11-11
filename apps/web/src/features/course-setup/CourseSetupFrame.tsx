"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { JourneyFrame, useJourneyStepValue } from "@/components/layout";
import { MemberMobileNav } from "@/features/home/MemberMobileNav";
import { LandingFooter } from "@/features/landing/LandingFooter";
import "@/features/landing/landing.css";
import "@/features/onboarding/onboarding.css";
import "./mobile-chrome.css";
import { MobileSetupStepper } from "./MobileSetupStepper";

type CourseSetupFrameProps = {
  children: ReactNode;
  /** Right-hand screen title. Omitted on onboarding, where it follows the step. */
  title?: string;
  backHref?: string;
  backLabel?: string;
  backAriaLabel?: string;
  mainClassName?: string;
  screenClassName?: string;
  /** Public footer chrome; omitted during onboarding, proposals, and Blueprint. */
  showFooter?: boolean;
  /**
   * Reader and outline keep the member destinations. Setup screens get the
   * stepper instead. Both are hidden from 921px up.
   */
  mobileNav?: "home" | "courses";
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
  mainClassName = "question-main",
  screenClassName,
  showFooter = false,
  mobileNav,
}: CourseSetupFrameProps) {
  return (
    <div
      className={`landing course-setup${mobileNav ? " ae-has-mobile-nav" : ""}${screenClassName ? ` ${screenClassName}` : ""}`}
    >
      <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500&display=swap"
      />
      <JourneyFrame bare>
        <header className="topfix">
          <div className="top">
            <Link className="back" href={backHref} aria-label={backAriaLabel}>
              <span className="ar izq" aria-hidden="true" />
              <span className="txt">{backLabel}</span>
            </Link>
            <Link className="marca" href="/" aria-label="Auteur Education">
              <span className="m1">Auteur</span>
              <span className="m2">Education</span>
            </Link>
            <ScreenTitle title={title} />
          </div>
          {mobileNav ? null : <MobileSetupStepper />}
        </header>
        <main className={mainClassName}>{children}</main>
        {mobileNav ? <MemberMobileNav current={mobileNav} /> : null}
        {showFooter ? <LandingFooter /> : null}
      </JourneyFrame>
    </div>
  );
}
