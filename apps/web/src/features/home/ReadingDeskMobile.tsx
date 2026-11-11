"use client";

import Link from "next/link";

import type { ReadingDeskModel } from "@/lib/course-progress";

function mobileStatus(model: ReadingDeskModel): string {
  if (model.lessonTotal === 0) {
    return "No lessons yet";
  }
  if (model.lessonsRead >= model.lessonTotal) {
    return "Completed";
  }
  if (model.lessonsRead === 0) {
    return "Ready to start";
  }
  return "In progress";
}

function mobilePosition(model: ReadingDeskModel): string {
  const parts = model.resumeLine.split(" · ");
  if (parts.length >= 2) {
    return `${parts[0]} · ${parts[1]}`;
  }
  return model.modulePosition;
}

/** Closed-course folder for member home at mobile widths only. */
export function ReadingDeskMobile({ model }: { model: ReadingDeskModel }) {
  return (
    <div className="ae-reading-desk-mobile">
      <div className="escena-w ae-reading-desk-mobile__scene">
        <article className="mini-c ae-reading-folder" aria-label="Your current course">
          <span className="sol folder-tab">
            <span className="folder-tab-label">Your course</span>
          </span>
          <div className="cu">
            <div className="ae-reading-folder-meta">
              <span>Auteur Education</span>
              <span>{mobileStatus(model)}</span>
            </div>
            <h2 className="ae-reading-folder-title">{model.title}</h2>
            <Link className="ae-reading-outline" href={`/courses/${model.courseId}`}>
              View course outline
              <span className="ar" aria-hidden="true" />
            </Link>
            <hr className="ae-reading-rule" />
            <p className="ae-reading-position">{mobilePosition(model)}</p>
            <p className="ae-reading-lesson">{model.headline}</p>
            <Link className="btn ae-reading-start" href={model.continueHref}>
              {model.continueLabel}
              <span className="ar" aria-hidden="true" />
            </Link>
          </div>
        </article>
      </div>
      <section className="ae-home-path ae-home-path--mobile-compact" aria-labelledby="ae-home-path-mobile">
        <div className="ae-home-path-head">
          <h2 id="ae-home-path-mobile">Your learning path</h2>
          <Link className="ae-home-text-link" href={`/courses/${model.courseId}`}>
            View full course <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ol className="ae-home-steps">
          {model.path.map((step, index) => {
            const href =
              model.modules[index]?.action?.href ?? `/courses/${model.courseId}`;
            return (
              <li key={`${step.title}-${index}`} className={step.state}>
                <Link
                  href={href}
                  aria-current={step.state === "current" ? "step" : undefined}
                >
                  <span className="n">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
