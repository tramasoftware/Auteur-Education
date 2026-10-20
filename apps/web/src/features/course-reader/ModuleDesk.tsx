"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import { ErrorNotice } from "@/components/ui";
import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";
import type { CourseModule, Lesson, SourceView } from "@/types/generator";

import { KnowledgeCheck } from "./KnowledgeCheck";
import {
  loadModuleReading,
  peekModuleReading,
  type ModuleReading,
} from "./module-reading-cache";
import "./module-desk.css";

const WORDS_PER_MINUTE = 180;

export type ModulePane = "overview" | "lesson" | "synthesis" | "sources" | "quiz";

type ModuleDeskProps = {
  courseId: string;
  moduleId: string;
  pane: ModulePane;
  lessonId?: string;
};

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

type DeskTab = {
  id: string;
  href: string;
  label: string;
  title: string;
};

type SheetNavLinks = {
  prev: { href: string; label: string } | null;
  next: { href: string; label: string } | null;
};

function sheetNavFromTabs(tabs: DeskTab[], activeId: string | undefined): SheetNavLinks {
  const index = tabs.findIndex((tab) => tab.id === activeId);
  if (index < 0) {
    return { prev: null, next: null };
  }
  const prevTab = index > 0 ? tabs[index - 1] : null;
  const nextTab = index < tabs.length - 1 ? tabs[index + 1] : null;
  return {
    prev: prevTab ? { href: prevTab.href, label: prevTab.label } : null,
    next: nextTab ? { href: nextTab.href, label: nextTab.label } : null,
  };
}

function SheetNav({ prev, next }: SheetNavLinks) {
  if (!prev && !next) {
    return null;
  }
  return (
    <nav className="next" aria-label="Section navigation">
      {prev ? (
        <Link className="prev" href={prev.href}>
          ← {prev.label}
        </Link>
      ) : null}
      {next ? (
        <Link className="gonext" href={next.href}>
          {next.label} →
        </Link>
      ) : null}
    </nav>
  );
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function AudioRail({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="side">
      <div className="ae-audio-slot">
        <section
          className="ae-audio-reader"
          data-expanded={open ? "true" : "false"}
          data-state="idle"
          aria-label="Lesson audio"
        >
          <button
            className="ae-audio-disclosure"
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="ae-audio-art" aria-hidden="true">
              <svg className="ae-audio-folder" viewBox="0 0 64 56" fill="none">
                <path
                  d="M3 18c3.3 0 5-2.3 5-5.6V11c0-1.66 1.34-3 3-3h14c1.66 0 3 1.34 3 3v1.4c0 3.3 2.3 5.6 5.6 5.6H57c2.21 0 4 1.79 4 4v23c0 2.21-1.79 4-4 4H7c-2.21 0-4-1.79-4-4V22c0-2.21 1.79-4 4-4Z"
                  fill="#24314f"
                />
                <path
                  d="M7 21h50c2.21 0 4 1.79 4 4v21c0 2.21-1.79 4-4 4H7c-2.21 0-4-1.79-4-4V25c0-2.21 1.79-4 4-4Z"
                  fill="#192341"
                />
              </svg>
            </span>
            <span className="ae-audio-copy">
              <span className="ae-audio-eyebrow">Listen</span>
              <span className="ae-audio-title">{title}</span>
            </span>
            <span className="ae-audio-signal" aria-hidden="true" />
          </button>
          <div className="ae-audio-panel">
            <div className="ae-audio-panel-clip">
              <div className="ae-audio-detail">
                <div className="ae-audio-controls">
                  <button className="ae-audio-step" type="button" disabled aria-label="Previous passage">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 5v14M18 5l-9 7 9 7Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button className="ae-audio-toggle" type="button" disabled aria-label="Listen">
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M6 3.5 16 10 6 16.5Z" fill="currentColor" />
                    </svg>
                  </button>
                  <button className="ae-audio-step" type="button" disabled aria-label="Next passage">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M18 5v14M6 5l9 7-9 7Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
                <p className="ae-audio-note">Audio is not available yet.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}

function Cover({
  courseId,
  module,
  moduleCount,
  nav,
}: {
  courseId: string;
  module: CourseModule;
  moduleCount: number;
  nav: SheetNavLinks;
}) {
  const minutes = module.lessons.reduce(
    (sum, lesson) => sum + readingMinutes(lesson.word_count),
    0,
  );
  return (
    <div className="cover">
      <span className="esq a">M{pad(module.index)}</span>
      <span className="esq b">
        {pad(module.lessons.length)} / {pad(module.lessons.length)}
      </span>
      <span className="esq c">AE</span>
      <span className="esq d">REV. 00</span>
      <div className="cab-t">
        <span className="mono">Auteur · Education</span>
        <span className="mono">Module overview</span>
        <span className="mono">
          Mod. {pad(module.index)} / {pad(moduleCount)}
        </span>
      </div>
      <div className="mod-num">
        <span className="mn-l">Module</span>
        <span className="mn-n">{pad(module.index)}</span>
        <span className="mn-d">of {pad(moduleCount)}</span>
      </div>
      <h2>{module.title}</h2>
      {module.function ? <p className="tesis">{module.function}</p> : null}
      {module.guiding_questions.length > 0 ? (
        <>
          <h3>Guiding questions</h3>
          <ul className="preguntas">
            {module.guiding_questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      ) : null}
      {module.outcome ? (
        <>
          <h3>Outcome</h3>
          <p className="outcome">{module.outcome}</p>
        </>
      ) : null}
      <ol className="lecciones">
        {module.lessons.map((lesson) => (
          <li key={lesson.id}>
            <Link href={`/courses/${courseId}/modules/${module.id}/lessons/${lesson.id}`}>
              <span className="n">{pad(lesson.index)}</span>
              <span className="t">{lesson.title}</span>
              <span className="d">{readingMinutes(lesson.word_count)} min</span>
            </Link>
          </li>
        ))}
        {module.synthesis ? (
          <li className="comp">
            <Link href={`/courses/${courseId}/modules/${module.id}/synthesis`}>
              <span className="n">—</span>
              <span className="t">Module synthesis</span>
            </Link>
          </li>
        ) : null}
        <li className="comp">
          <Link href={`/courses/${courseId}/modules/${module.id}/sources`}>
            <span className="n">—</span>
            <span className="t">Sources used in this module</span>
            <span className="d">
              {module.sources.length === 1 ? "1 source" : `${module.sources.length} sources`}
            </span>
          </Link>
        </li>
        {module.knowledge_check ? (
          <li className="comp">
            <Link href={`/courses/${courseId}/modules/${module.id}/knowledge-check`}>
              <span className="n">—</span>
              <span className="t">Module quiz</span>
              <span className="d">{module.knowledge_check.questions.length} questions</span>
            </Link>
          </li>
        ) : null}
      </ol>
      <div className="pie-t">
        <p className="mono">
          {`${module.lessons.length} ${module.lessons.length === 1 ? "lesson" : "lessons"} · ${minutes} min read${module.knowledge_check ? " · one quiz" : ""}`}
        </p>
        <svg className="sello" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <path
              id={`sello-ring-${module.id}`}
              d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0"
            />
          </defs>
          <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" strokeWidth="1" />
          <text
            fontFamily="var(--font-ui), Inter, Arial, sans-serif"
            fontSize="9.2"
            fontWeight="600"
            letterSpacing="2.2"
            fill="currentColor"
          >
            <textPath href={`#sello-ring-${module.id}`}>
              AUTEUR · ARCHIVE · EDUCATION · MMXXVI ·{" "}
            </textPath>
          </text>
          <text
            x="50"
            y="47"
            textAnchor="middle"
            fontFamily="var(--font-editorial), Georgia, serif"
            fontSize="13"
            fill="currentColor"
          >
            Mod.
          </text>
          <text
            x="50"
            y="62"
            textAnchor="middle"
            fontFamily="var(--font-editorial), Georgia, serif"
            fontSize="15"
            fill="currentColor"
          >
            {pad(module.index)}
          </text>
        </svg>
      </div>
      <SheetNav {...nav} />
    </div>
  );
}

function LessonSheet({ lesson, nav }: { lesson: Lesson; nav: SheetNavLinks }) {
  return (
    <>
      <header className="head">
        <h1>{lesson.title}</h1>
        {lesson.purpose ? <p className="para">{lesson.purpose}</p> : null}
        <div className="meta">
          <span>
            {readingMinutes(lesson.word_count)} min read ~{lesson.word_count} words
          </span>
        </div>
      </header>
      <div className="body">
        {lesson.sections.map((section, index) => {
          const heading = section.heading.trim();
          const blocks = paragraphs(section.body);
          return (
            <section key={index}>
              {heading ? <h2>{heading}</h2> : null}
              {blocks.map((block, blockIndex) => (
                <p key={blockIndex}>{block}</p>
              ))}
            </section>
          );
        })}
      </div>
      <SheetNav {...nav} />
    </>
  );
}

function SynthesisSheet({ module, nav }: { module: CourseModule; nav: SheetNavLinks }) {
  return (
    <>
      <header className="head">
        <h1>Module synthesis</h1>
        <p className="para">{module.title}</p>
      </header>
      <div className="prose">
        {module.synthesis ? (
          paragraphs(module.synthesis).map((paragraph, index) => <p key={index}>{paragraph}</p>)
        ) : (
          <p>This module does not have a synthesis yet.</p>
        )}
      </div>
      <SheetNav {...nav} />
    </>
  );
}

function SourcesSheet({ module, nav }: { module: CourseModule; nav: SheetNavLinks }) {
  return (
    <>
      <header className="head">
        <h1>Sources</h1>
        <p className="para">Sources used in {module.title}.</p>
      </header>
      {module.sources.length > 0 ? (
        <ol className="fuentes">
          {module.sources.map((source, index) => (
            <SourceRow key={`${source.ref}:${source.url}:${index}`} index={index} source={source} />
          ))}
        </ol>
      ) : (
        <p className="sheet-loading">No sources were recorded for this module.</p>
      )}
      <SheetNav {...nav} />
    </>
  );
}

function SourceRow({ source, index }: { source: SourceView; index: number }) {
  return (
    <li>
      <span className="s">{pad(index + 1)}</span>
      <span>
        <a href={source.url} target="_blank" rel="noreferrer noopener">
          {source.title}
        </a>
        <span className="de">
          {source.author_or_institution ? `${source.author_or_institution}` : ""}
          {source.date ? ` (${source.date})` : ""}
          {source.verification === "unverified" ? " · not verified by search" : ""}
          {source.limits ? ` · ${source.limits}` : ""}
        </span>
      </span>
    </li>
  );
}

function QuizSheet({ module, nav }: { module: CourseModule; nav: SheetNavLinks }) {
  return (
    <>
      <header className="head">
        <h1>Module quiz</h1>
        <p className="para">
          Questions on the ideas this module developed. Optional and repeatable.
        </p>
      </header>
      {module.knowledge_check ? (
        <KnowledgeCheck check={module.knowledge_check} sheet />
      ) : (
        <p className="sheet-loading">This module does not have a quiz yet.</p>
      )}
      <SheetNav {...nav} />
    </>
  );
}

export function ModuleDesk({ courseId, moduleId, pane, lessonId }: ModuleDeskProps) {
  const [pack, setPack] = useState<ModuleReading | null>(() =>
    peekModuleReading(courseId, moduleId),
  );
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const ready = peekModuleReading(courseId, moduleId);
    if (ready) {
      setPack(ready);
      setError(null);
      return;
    }
    let cancelled = false;
    setPack(null);
    setError(null);
    loadModuleReading(courseId, moduleId)
      .then((next) => {
        if (!cancelled) setPack(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, moduleId]);

  const course = pack?.course ?? null;
  const module = pack?.module ?? null;
  const lesson =
    pane === "lesson" && lessonId ? (pack?.lessons.get(lessonId) ?? null) : null;

  const base = `/courses/${courseId}/modules/${moduleId}`;
  const activeId = pane === "lesson" ? lessonId : pane;
  const tabs = module
    ? [
        {
          id: "overview",
          href: base,
          label: `Module ${pad(module.index)}`,
          title: module.title,
        },
        ...module.lessons.map((item) => ({
          id: item.id,
          href: `${base}/lessons/${item.id}`,
          label: `Lesson ${item.index}`,
          title: item.title,
        })),
        {
          id: "synthesis",
          href: `${base}/synthesis`,
          label: "Synthesis",
          title: "Module synthesis",
        },
        {
          id: "sources",
          href: `${base}/sources`,
          label: "Sources",
          title: "Sources used in this module",
        },
        {
          id: "quiz",
          href: `${base}/knowledge-check`,
          label: "Quiz",
          title: "Module quiz",
        },
      ]
    : [];

  const audioTitle =
    pane === "lesson" && lesson
      ? lesson.title
      : (tabs.find((tab) => tab.id === activeId)?.title ?? "This module");
  const visibleLesson = lesson && lesson.id === lessonId ? lesson : null;
  const sheetNav = sheetNavFromTabs(tabs, activeId);

  return (
    <CourseSetupFrame
      title="Your course"
      backHref={`/courses/${courseId}`}
      backLabel="Course"
      backAriaLabel="Back to the course"
      mainClassName="desk-main"
      screenClassName="module-desk"
    >
      <div className="archivo" data-pane={pane}>
        <Link className="archive-tab" href={`/courses/${courseId}`}>
          <span className="folder-tab-label">{course?.title ?? "Your course"}</span>
        </Link>
        <div className="carpeta">
          <div
            className="lectura"
            style={{ "--tab-stack": `${Math.max(tabs.length, 1) * 124 + 48}px` } as CSSProperties}
          >
            <div className="col" key={activeId ?? "loading"}>
              <article className={pane === "overview" ? "sheet cover" : "sheet"}>
                {!module ? (
                  <p className="sheet-loading">Loading…</p>
                ) : pane === "overview" ? (
                  <Cover
                    courseId={courseId}
                    module={module}
                    moduleCount={course?.modules.length ?? module.index}
                    nav={sheetNav}
                  />
                ) : pane === "lesson" ? (
                  visibleLesson ? (
                    <LessonSheet lesson={visibleLesson} nav={sheetNav} />
                  ) : (
                    <p className="sheet-loading">
                      {pack ? "This lesson is not available." : "Loading…"}
                    </p>
                  )
                ) : pane === "synthesis" ? (
                  <SynthesisSheet module={module} nav={sheetNav} />
                ) : pane === "sources" ? (
                  <SourcesSheet module={module} nav={sheetNav} />
                ) : (
                  <QuizSheet module={module} nav={sheetNav} />
                )}
              </article>
            </div>
            {tabs.length > 0 ? (
              <nav className="stabs" aria-label="Sections in this module">
                {tabs.map((tab) => (
                  <Link
                    key={tab.id}
                    className={[
                      "stab",
                      tab.id === "overview" ? "cover" : "",
                      tab.id === activeId ? "on" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    href={tab.href}
                    aria-current={tab.id === activeId ? "page" : undefined}
                    title={tab.title}
                  >
                    <span className="v">{tab.label}</span>
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>
          <AudioRail title={audioTitle} />
        </div>
        <div className="form-avisos">
          <ErrorNotice error={error} />
        </div>
      </div>
    </CourseSetupFrame>
  );
}
