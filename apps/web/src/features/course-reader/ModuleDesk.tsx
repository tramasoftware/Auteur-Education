"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ErrorNotice } from "@/components/ui";
import { getAccountProfile } from "@/lib/api";
import { CourseSetupFrame } from "@/features/course-setup/CourseSetupFrame";
import type { Course, CourseModule, Lesson, SourceView } from "@/types/generator";

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

const LESSON_COUNT_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

function lessonCountPhrase(count: number): string {
  const word =
    count >= 0 && count < LESSON_COUNT_WORDS.length ? LESSON_COUNT_WORDS[count] : String(count);
  return `${word} ${count === 1 ? "lesson" : "lessons"}`;
}

function courseCreatedLabel(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function coverCredit(name: string | null, createdAt: string | null | undefined): string {
  if (name === null) {
    return "";
  }
  const prepared = name ? `Prepared by Auteur for ${name}` : "Prepared by Auteur";
  const date = courseCreatedLabel(createdAt);
  return date ? `${prepared} · ${date}` : prepared;
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

type PageBlock = {
  key: string;
  node?: ReactNode;
  breakBefore?: boolean;
  keepWithNext?: boolean;
  gap?: "para" | "section" | "sentence";
  /** Sentences that share an id are one paragraph and may split across pages. */
  paragraphId?: string;
  text?: string;
  heading?: string;
  prose?: boolean;
};

type FlowGroup = {
  key: string;
  paragraphId?: string;
  gap?: "para" | "section";
  prose: boolean;
  heading?: string;
  texts: string[];
  node?: ReactNode;
};

const SENTENCE_ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "fig",
  "no",
  "pp",
  "vol",
  "cf",
  "ed",
  "al",
  "e.g",
  "i.e",
  "u.s",
  "u.k",
  "a.m",
  "p.m",
]);

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function packBlockRanges(
  blocks: PageBlock[],
  tops: number[],
  bottoms: number[],
  available: number,
): number[][] {
  const count = blocks.length;
  if (count === 0 || available <= 0) {
    return count ? [blocks.map((_, index) => index)] : [];
  }
  const pages: number[][] = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    if (index === start) {
      continue;
    }
    const hardBreak = Boolean(blocks[index].breakBefore);
    const overflow = bottoms[index] - tops[start] > available + 1;
    if (!hardBreak && !overflow) {
      continue;
    }
    let end = index;
    if (!hardBreak && blocks[end - 1]?.keepWithNext && end - start > 1) {
      end -= 1;
    }
    pages.push(Array.from({ length: end - start }, (_, offset) => start + offset));
    start = end;
    index = start - 1;
  }
  if (start < count) {
    pages.push(Array.from({ length: count - start }, (_, offset) => start + offset));
  }
  return pages.length > 0 ? pages : [blocks.map((_, index) => index)];
}

function SheetPager({
  page,
  total,
  onPrev,
  onNext,
  nextControl,
}: {
  page: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  nextControl?: ReactNode;
}) {
  const atStart = page <= 0;
  const atEnd = page >= total - 1;
  return (
    <nav className="ae-reading-nav" aria-label="Pages">
      <button type="button" onClick={onPrev} disabled={atStart} aria-label="Previous page">
        <span className="ar izq" aria-hidden="true" />
        <span className="ae-page-button-label">Previous</span>
      </button>
      <output aria-live="polite" aria-atomic="true">
        Page {page + 1} of {total}
      </output>
      {nextControl ?? (
        <button type="button" onClick={onNext} disabled={atEnd} aria-label="Next page">
          <span className="ae-page-button-label">Next</span>
          <span className="ar" aria-hidden="true" />
        </button>
      )}
    </nav>
  );
}

function PagedSheet({
  blocks,
  pageKey,
  marks,
}: {
  blocks: PageBlock[];
  pageKey: string;
  marks?: ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef(blocks);
  const [pages, setPages] = useState<number[][] | null>(null);
  const [page, setPage] = useState(0);

  blocksRef.current = blocks;
  const pageKeyRef = useRef(pageKey);
  const signature = blocks
    .map((block) => `${block.key}:${block.breakBefore ? 1 : 0}:${block.keepWithNext ? 1 : 0}`)
    .join("|");

  useIsoLayoutEffect(() => {
    const body = bodyRef.current;
    const measure = measureRef.current;
    if (!body || !measure) {
      return;
    }
    let frame = 0;
    const keyChanged = pageKeyRef.current !== pageKey;
    if (keyChanged) {
      pageKeyRef.current = pageKey;
    }
    const pack = (resetPage: boolean) => {
      frame = 0;
      const items = blocksRef.current;
      measure.style.width = `${body.clientWidth}px`;
      const available = body.clientHeight;
      if (available <= 0) {
        return;
      }
      const flowing = items.some((item) => item.text);
      let next: number[][] | null;
      if (flowing) {
        next = packFlowRanges(items, probeRef.current, measure, available);
      } else {
        const nodes = [...measure.querySelectorAll<HTMLElement>("[data-block]")];
        if (nodes.length !== items.length) {
          return;
        }
        const tops = nodes.map((node) => node.offsetTop);
        const bottoms = nodes.map((node) => node.offsetTop + node.offsetHeight);
        next = packBlockRanges(items, tops, bottoms, available);
      }
      if (!next) {
        return;
      }
      setPages((current) => {
        if (
          current &&
          current.length === next.length &&
          current.every((group, groupIndex) =>
            group.every((value, valueIndex) => value === next[groupIndex]?.[valueIndex]),
          )
        ) {
          return current;
        }
        return next;
      });
      setPage((current) => Math.min(resetPage ? 0 : current, Math.max(next.length - 1, 0)));
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => pack(false));
      }
    };
    pack(keyChanged);
    const resize = new ResizeObserver(schedule);
    resize.observe(body);
    const fonts = document.fonts?.ready.then(schedule);
    const html = document.documentElement;
    const attributes = new MutationObserver(schedule);
    attributes.observe(html, { attributes: true, attributeFilter: ["style", "data-text-size"] });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      attributes.disconnect();
      void fonts;
    };
  }, [pageKey, signature]);

  const total = pages?.length ?? 1;
  const safePage = Math.min(page, total - 1);
  const visible = pages ? pages[safePage] ?? [] : [];

  return (
    <>
      {safePage === 0 ? marks : null}
      <div className="paged-sheet">
        <div className="sheet-body" ref={bodyRef}>
          <div className="sheet-measure" ref={measureRef} aria-hidden="true" inert>
            {blocks.map((block) =>
              block.text ? null : (
                <div
                  key={block.key}
                  className="sheet-block"
                  data-block=""
                  data-flow-key={block.key}
                  data-gap={block.gap}
                >
                  {block.node}
                </div>
              ),
            )}
            <div className="sheet-probe" ref={probeRef} />
          </div>
          <div className="sheet-page">
            <FlowBlocks blocks={visible.flatMap((index) => blocks[index] ?? [])} />
          </div>
        </div>
        <SheetPager
          page={safePage}
          total={total}
          onPrev={() => setPage((current) => Math.max(0, current - 1))}
          onNext={() => setPage((current) => Math.min(total - 1, current + 1))}
        />
      </div>
    </>
  );
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function sentences(paragraph: string): string[] {
  const text = paragraph.replace(/\s+/g, " ").trim();
  if (!text) {
    return [];
  }
  const out: string[] = [];
  const marks = /[.!?]+(?:["'”’)\]]+)?/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = marks.exec(text))) {
    const end = match.index + match[0].length;
    const next = text.slice(end);
    if (next.trim() && !/^\s+["'“‘(]*[A-Z]/.test(next)) {
      continue;
    }
    const token = text
      .slice(0, match.index)
      .trimEnd()
      .match(/([A-Za-z]+(?:\.[A-Za-z]+)*)\.?$/)?.[1]
      ?.toLowerCase();
    if (token && SENTENCE_ABBREVIATIONS.has(token)) {
      continue;
    }
    const sentence = text.slice(start, end).trim();
    if (sentence) {
      out.push(sentence);
    }
    start = end;
    const space = /^\s+/.exec(text.slice(start));
    if (space) {
      start += space[0].length;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) {
    out.push(rest);
  }
  return out.length > 0 ? out : [text];
}

function groupFlow(blocks: PageBlock[]): FlowGroup[] {
  const groups: FlowGroup[] = [];
  for (const block of blocks) {
    const prev = groups[groups.length - 1];
    if (
      block.text &&
      block.paragraphId &&
      prev &&
      !prev.node &&
      prev.paragraphId === block.paragraphId
    ) {
      prev.texts.push(block.text);
      if (block.heading && !prev.heading) {
        prev.heading = block.heading;
      }
      continue;
    }
    groups.push({
      key: block.key,
      paragraphId: block.paragraphId,
      gap: block.gap === "sentence" ? undefined : block.gap,
      prose: Boolean(block.prose),
      heading: block.heading,
      texts: block.text ? [block.text] : [],
      node: block.text ? undefined : block.node,
    });
  }
  return groups;
}

function sliceHeight(blocks: PageBlock[], probe: HTMLElement, measure: HTMLElement): number {
  probe.replaceChildren();
  for (const group of groupFlow(blocks)) {
    if (group.texts.length === 0) {
      const source = measure.querySelector<HTMLElement>(
        `[data-flow-key="${CSS.escape(group.key)}"]`,
      );
      if (source) {
        probe.append(source.cloneNode(true));
      }
      continue;
    }
    const block = document.createElement("div");
    block.className = "sheet-block";
    if (group.gap) {
      block.dataset.gap = group.gap;
    }
    const body = document.createElement("div");
    body.className = group.prose ? "prose" : "body";
    if (group.heading) {
      const heading = document.createElement("h2");
      heading.textContent = group.heading;
      body.append(heading);
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = group.texts.join(" ");
    body.append(paragraph);
    block.append(body);
    probe.append(block);
  }
  return probe.scrollHeight;
}

function packFlowRanges(
  blocks: PageBlock[],
  probe: HTMLElement | null,
  measure: HTMLElement,
  available: number,
): number[][] | null {
  if (!probe) {
    return null;
  }
  const pages: number[][] = [];
  let start = 0;
  while (start < blocks.length) {
    let end = start + 1;
    while (end < blocks.length && !blocks[end]?.breakBefore) {
      if (sliceHeight(blocks.slice(start, end + 1), probe, measure) > available + 1) {
        break;
      }
      end += 1;
    }
    pages.push(Array.from({ length: end - start }, (_, offset) => start + offset));
    start = end;
  }
  probe.replaceChildren();
  return pages.length > 0 ? pages : [blocks.map((_, index) => index)];
}

function FlowBlocks({ blocks }: { blocks: PageBlock[] }) {
  return groupFlow(blocks).map((group) => (
    <div key={group.key} className="sheet-block" data-gap={group.gap}>
      {group.texts.length > 0 ? (
        <div className={group.prose ? "prose" : "body"}>
          {group.heading ? <h2>{group.heading}</h2> : null}
          <p>{group.texts.join(" ")}</p>
        </div>
      ) : (
        group.node
      )}
    </div>
  ));
}

/** Purpose sometimes ends with “(Source: …)”; links live in lesson.sources instead. */
function lessonPurposeText(purpose: string): string {
  return purpose.replace(/\s*\(Source:\s*[^)]+\)\s*$/i, "").trim();
}

function LessonMeta({ lesson }: { lesson: Lesson }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sources = lesson.sources;
  const sourceLabel =
    sources.length === 1 ? "1 Source" : `${sources.length} Sources`;

  return (
    <div className="meta">
      <span>
        {readingMinutes(lesson.word_count)} min read ~{lesson.word_count} words
      </span>
      {sources.length > 0 ? (
        <div className="meta-src">
          <button
            type="button"
            className="meta-src-toggle"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((open) => !open)}
          >
            <span>{sourceLabel}</span>
            <span className="meta-src-icon" aria-hidden="true">
              {sourcesOpen ? "−" : "+"}
            </span>
          </button>
          {sourcesOpen ? (
            <ul className="meta-src-list">
              {sources.map((source, index) => (
                <li key={`${source.ref}:${source.url}:${index}`}>
                  <a href={source.url} target="_blank" rel="noreferrer noopener">
                    {source.title || source.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AudioRail({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
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
  );
}

function CompanionRail({
  links,
  activeId,
}: {
  links: DeskTab[];
  activeId: string | undefined;
}) {
  if (links.length === 0) {
    return null;
  }
  return (
    <nav className="side-comps" aria-label="Module sections">
      <ol>
        {links.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={item.id === activeId ? "on" : undefined}
              aria-current={item.id === activeId ? "page" : undefined}
            >
              <span className="n">—</span>
              <span className="t">{item.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function CoverMarks({ module }: { module: CourseModule }) {
  return (
    <>
      <span className="esq a">M{pad(module.index)}</span>
      <span className="esq b">
        {pad(module.lessons.length)} / {pad(module.lessons.length)}
      </span>
      <span className="esq c">AE</span>
      <span className="esq d">REV. 00</span>
    </>
  );
}

function CoverSeal({
  module,
  summary,
  credit,
}: {
  module: CourseModule;
  summary: string;
  credit: string;
}) {
  const ringId = `sello-${useId().replace(/:/g, "")}`;
  return (
    <div className="pie-t">
      <div className="pie-copy">
        {credit ? <p className="mono">{credit}</p> : null}
        <p className="mono">{summary}</p>
      </div>
      <svg className="sello" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <path id={ringId} d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" />
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
          <textPath href={`#${ringId}`}>AUTEUR · ARCHIVE · EDUCATION · MMXXVI · </textPath>
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
  );
}

function coverBlocks(
  courseId: string,
  module: CourseModule,
  moduleCount: number,
  credit: string,
): PageBlock[] {
  const minutes = module.lessons.reduce(
    (sum, lesson) => sum + readingMinutes(lesson.word_count),
    0,
  );
  const summary = `${lessonCountPhrase(module.lessons.length)} · ${minutes} min read${module.knowledge_check ? " · one quiz" : ""}`;
  const rows: { key: string; comp?: boolean; node: ReactNode }[] = module.lessons.map((lesson) => ({
    key: lesson.id,
    node: (
      <Link href={`/courses/${courseId}/modules/${module.id}/lessons/${lesson.id}`}>
        <span className="n">{pad(lesson.index)}</span>
        <span className="t">{lesson.title}</span>
        <span className="d">{readingMinutes(lesson.word_count)} min</span>
      </Link>
    ),
  }));
  if (module.synthesis) {
    rows.push({
      key: "synthesis",
      comp: true,
      node: (
        <Link href={`/courses/${courseId}/modules/${module.id}/synthesis`}>
          <span className="n">—</span>
          <span className="t">Module synthesis</span>
        </Link>
      ),
    });
  }
  rows.push({
    key: "sources",
    comp: true,
    node: (
      <Link href={`/courses/${courseId}/modules/${module.id}/sources`}>
        <span className="n">—</span>
        <span className="t">Sources used in this module</span>
        <span className="d">
          {module.sources.length === 1 ? "1 source" : `${module.sources.length} sources`}
        </span>
      </Link>
    ),
  });
  if (module.knowledge_check) {
    rows.push({
      key: "quiz",
      comp: true,
      node: (
        <Link href={`/courses/${courseId}/modules/${module.id}/knowledge-check`}>
          <span className="n">—</span>
          <span className="t">Module quiz</span>
          <span className="d">{module.knowledge_check.questions.length} questions</span>
        </Link>
      ),
    });
  }

  const blocks: PageBlock[] = [
    {
      key: "identity",
      node: (
        <>
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
        </>
      ),
    },
  ];
  if (module.guiding_questions.length > 0) {
    blocks.push({
      key: "questions",
      node: (
        <>
          <h3>Guiding questions</h3>
          <ul className="preguntas">
            {module.guiding_questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      ),
    });
  }
  if (module.outcome) {
    blocks.push({
      key: "outcome",
      node: (
        <>
          <h3>Outcome</h3>
          <p className="outcome">{module.outcome}</p>
        </>
      ),
    });
  }
  rows.forEach((row, index) => {
    blocks.push({
      key: row.key,
      breakBefore: index === 0,
      node: (
        <ol className="lecciones sheet-rows">
          <li className={row.comp ? "comp" : undefined}>{row.node}</li>
        </ol>
      ),
    });
  });
  blocks.push({
    key: credit ? `seal:${credit}` : "seal",
    node: <CoverSeal module={module} summary={summary} credit={credit} />,
  });
  return blocks;
}

function lessonBlocks(lesson: Lesson): PageBlock[] {
  const purpose = lesson.purpose ? lessonPurposeText(lesson.purpose) : "";
  const blocks: PageBlock[] = [
    {
      key: "head",
      node: (
        <header className="head">
          <h1>{lesson.title}</h1>
          {purpose ? <p className="para">{purpose}</p> : null}
          <LessonMeta lesson={lesson} />
        </header>
      ),
    },
  ];
  lesson.sections.forEach((section, index) => {
    const heading = section.heading.trim();
    const parts = paragraphs(section.body);
    if (parts.length === 0) {
      if (heading) {
        blocks.push({
          key: `s${index}`,
          gap: "section",
          node: (
            <div className="body">
              <h2>{heading}</h2>
            </div>
          ),
        });
      }
      return;
    }
    parts.forEach((part, partIndex) => {
      sentences(part).forEach((line, lineIndex) => {
        blocks.push({
          key: `s${index}-${partIndex}-${lineIndex}`,
          paragraphId: `s${index}-${partIndex}`,
          gap: lineIndex === 0 ? (partIndex === 0 ? "section" : "para") : "sentence",
          text: line,
          heading: lineIndex === 0 && partIndex === 0 && heading ? heading : undefined,
        });
      });
    });
  });
  return blocks;
}

function synthesisBlocks(module: CourseModule): PageBlock[] {
  const parts = module.synthesis ? paragraphs(module.synthesis) : [];
  const blocks: PageBlock[] = [
    {
      key: "head",
      node: (
        <header className="head">
          <h1>Module synthesis</h1>
          <p className="para">{module.title}</p>
        </header>
      ),
    },
  ];
  if (parts.length === 0) {
    blocks.push({
      key: "empty",
      gap: "para",
      node: (
        <div className="prose">
          <p>This module does not have a synthesis yet.</p>
        </div>
      ),
    });
    return blocks;
  }
  parts.forEach((part, index) => {
    sentences(part).forEach((line, lineIndex) => {
      blocks.push({
        key: `p${index}-${lineIndex}`,
        paragraphId: `p${index}`,
        gap: lineIndex === 0 ? "para" : "sentence",
        prose: true,
        text: line,
      });
    });
  });
  return blocks;
}

function sourcesBlocks(module: CourseModule): PageBlock[] {
  const blocks: PageBlock[] = [
    {
      key: "head",
      node: (
        <header className="head">
          <h1>Sources</h1>
          <p className="para">Sources used in {module.title}.</p>
        </header>
      ),
    },
  ];
  if (module.sources.length === 0) {
    blocks.push({
      key: "empty",
      gap: "para",
      node: <p className="sheet-loading">No sources were recorded for this module.</p>,
    });
    return blocks;
  }
  module.sources.forEach((source, index) => {
    blocks.push({
      key: `${source.ref}:${source.url}:${index}`,
      node: (
        <ol className="fuentes">
          <SourceRow index={index} source={source} />
        </ol>
      ),
    });
  });
  return blocks;
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

function QuizSheet({
  courseId,
  course,
  module,
}: {
  courseId: string;
  course: Course | null;
  module: CourseModule;
}) {
  const check = module.knowledge_check;
  const questionCount = check?.questions.length ?? 0;
  const total = Math.max(questionCount, 1);
  const [page, setPage] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [allAnswered, setAllAnswered] = useState(false);
  const next = course?.modules.find((item) => item.index === module.index + 1) ?? null;
  const continueHref =
    next && next.state === "published"
      ? `/courses/${courseId}/modules/${next.id}`
      : `/courses/${courseId}`;
  const continueLabel = next ? `Continue to module ${pad(next.index)}` : "Back to the course";
  const safePage = Math.min(page, total - 1);
  const onLastQuestion = questionCount > 0 && safePage >= questionCount - 1;

  useEffect(() => {
    setPage(0);
    setRevealed(false);
    setAllAnswered(false);
  }, [module.id]);

  return (
    <div className="paged-sheet">
      <div className="sheet-body">
        <div className="sheet-page">
          {check ? (
            <KnowledgeCheck
              check={check}
              sheet
              questionIndex={safePage}
              showActions={revealed && onLastQuestion}
              revealed={revealed}
              onRevealedChange={setRevealed}
              onAnsweredChange={setAllAnswered}
              omitContinue
              continueHref={continueHref}
              continueLabel={continueLabel}
              overviewHref={`/courses/${courseId}/modules/${module.id}`}
            />
          ) : (
            <p className="sheet-loading">This module does not have a quiz yet.</p>
          )}
        </div>
      </div>
      <SheetPager
        page={safePage}
        total={total}
        onPrev={() => setPage((current) => Math.max(0, current - 1))}
        onNext={() => setPage((current) => Math.min(total - 1, current + 1))}
        nextControl={
          onLastQuestion ? (
            revealed ? (
              <Link className="ae-page-forward" href={continueHref}>
                <span className="ae-page-button-label">{continueLabel}</span>
                <span className="ar" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                className="ae-page-forward"
                disabled={!allAnswered}
                onClick={() => setRevealed(true)}
              >
                <span className="ae-page-button-label">Check my answers</span>
                <span className="ar" aria-hidden="true" />
              </button>
            )
          ) : undefined
        }
      />
    </div>
  );
}

export function ModuleDesk({ courseId, moduleId, pane, lessonId }: ModuleDeskProps) {
  const [pack, setPack] = useState<ModuleReading | null>(() =>
    peekModuleReading(courseId, moduleId),
  );
  const [error, setError] = useState<unknown>(null);
  const [learnerName, setLearnerName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAccountProfile()
      .then((profile) => {
        if (cancelled) {
          return;
        }
        const name = [profile.first_name, profile.last_name]
          .map((part) => part?.trim() ?? "")
          .filter(Boolean)
          .join(" ");
        setLearnerName(name);
      })
      .catch(() => {
        if (!cancelled) {
          setLearnerName("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const companionActiveId = pane === "lesson" ? "lessons" : pane;
  const lessonTabs = module
    ? module.lessons.map((item) => ({
        id: item.id,
        href: `${base}/lessons/${item.id}`,
        label: `Lesson ${item.index}`,
        title: item.title,
      }))
    : [];
  const firstLesson = module?.lessons[0] ?? null;
  const companionLinks = module
    ? [
        {
          id: "overview",
          href: base,
          label: `Module ${pad(module.index)}`,
          title: `Module ${pad(module.index)}`,
        },
        ...(firstLesson
          ? [
              {
                id: "lessons",
                href: `${base}/lessons/${firstLesson.id}`,
                label: "Lessons",
                title: "Lessons",
              },
            ]
          : []),
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
      : pane === "overview" && module
        ? module.title
        : (companionLinks.find((item) => item.id === activeId)?.title ?? "This module");
  const visibleLesson = lesson && lesson.id === lessonId ? lesson : null;
  const pageKey = `${moduleId}:${activeId ?? pane}`;
  const blocks: PageBlock[] = !module
    ? [{ key: "loading", node: <p className="sheet-loading">Loading…</p> }]
    : pane === "overview"
      ? coverBlocks(
          courseId,
          module,
          course?.modules.length ?? module.index,
          coverCredit(learnerName, course?.created_at),
        )
      : pane === "lesson"
        ? visibleLesson
          ? lessonBlocks(visibleLesson)
          : [
              {
                key: "missing",
                node: (
                  <p className="sheet-loading">
                    {pack ? "This lesson is not available." : "Loading…"}
                  </p>
                ),
              },
            ]
        : pane === "synthesis"
          ? synthesisBlocks(module)
          : pane === "sources"
            ? sourcesBlocks(module)
            : [{ key: "loading", node: <p className="sheet-loading">Loading…</p> }];

  return (
    <CourseSetupFrame
      title="Your course"
      backHref={`/courses/${courseId}`}
      backLabel="Course"
      backAriaLabel="Back to the course"
      mainClassName="desk-main"
      screenClassName="module-desk"
      showFooter
    >
      <div className="archivo" data-pane={pane}>
        <Link className="archive-tab" href={`/courses/${courseId}`}>
          <span className="folder-tab-label">{course?.title ?? "Your course"}</span>
        </Link>
        <div className="carpeta">
          <div className="lectura">
            <div className="col" key={activeId ?? "loading"}>
              <article className={pane === "overview" ? "sheet cover" : "sheet"}>
                {pane === "quiz" && module ? (
                  <QuizSheet courseId={courseId} course={course} module={module} />
                ) : (
                  <PagedSheet
                    pageKey={pageKey}
                    blocks={blocks}
                    marks={pane === "overview" && module ? <CoverMarks module={module} /> : null}
                  />
                )}
              </article>
            </div>
            {pane === "lesson" && lessonTabs.length > 0 ? (
              <nav className="stabs" aria-label="Lessons in this module">
                {lessonTabs.map((tab) => (
                  <Link
                    key={tab.id}
                    className={["stab", tab.id === activeId ? "on" : ""].filter(Boolean).join(" ")}
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
          <aside className="side">
            <CompanionRail links={companionLinks} activeId={companionActiveId} />
            <AudioRail title={audioTitle} />
          </aside>
        </div>
        <div className="form-avisos">
          <ErrorNotice error={error} />
        </div>
      </div>
    </CourseSetupFrame>
  );
}
