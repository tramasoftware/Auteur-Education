"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { courses } from "@/lib/api";
import {
  inProgressCount,
  inProgressCourses,
  type ReadingDeskModel,
} from "@/lib/course-progress";
import type { CourseProgress, LibraryCourse } from "@/types/generator";

import { loadReadingDeskModel } from "./reading-desk-load";
import { ReadingCoursePager } from "./ReadingCoursePager";

export function ReadingDesk({
  onInProgress,
}: {
  onInProgress: (count: number) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "empty" | "failed">("loading");
  const [library, setLibrary] = useState<LibraryCourse[]>([]);
  const [progress, setProgress] = useState<Map<string, CourseProgress>>(new Map());
  const [inProgressList, setInProgressList] = useState<LibraryCourse[]>([]);
  const [coursePage, setCoursePage] = useState(0);
  const modelsRef = useRef<Record<string, ReadingDeskModel>>({});
  const [model, setModel] = useState<ReadingDeskModel | null>(null);
  const [deskLoading, setDeskLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      setCompact(media.matches);
      if (media.matches) {
        setOpen(true);
      }
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    courses
      .list()
      .then(async (body) => {
        const loaded = await Promise.all(
          body.courses.map(async (item) => {
            try {
              return [item.id, await courses.progress(item.id)] as const;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) {
          return;
        }
        const progressMap = new Map(
          loaded.flatMap((entry) => (entry ? [entry] : [])),
        );
        const active = inProgressCourses(body.courses, progressMap);
        onInProgress(inProgressCount(body.courses, progressMap));
        setLibrary(body.courses);
        setProgress(progressMap);
        setInProgressList(active);
        modelsRef.current = {};
        setCoursePage(0);
        if (active.length === 0) {
          setModel(null);
          setPhase("empty");
          return;
        }
        setPhase("loading");
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onInProgress]);

  const showCachedCourse = useCallback(
    (pageIndex: number) => {
      if (inProgressList.length === 0) {
        return;
      }
      const index = Math.min(Math.max(0, pageIndex), inProgressList.length - 1);
      const cached = modelsRef.current[inProgressList[index].id];
      if (!cached) {
        return;
      }
      setCoursePage(index);
      setModel(cached);
      setCurrent(cached.openIndex);
      setOpen(false);
    },
    [inProgressList],
  );

  useEffect(() => {
    if (inProgressList.length === 0 || library.length === 0) {
      return;
    }

    let cancelled = false;
    setPhase("loading");
    setDeskLoading(true);
    setModel(null);

    void (async () => {
      try {
        await Promise.all(
          inProgressList.map(async (item) => {
            const itemProgress = progress.get(item.id);
            if (!itemProgress) {
              throw new Error("missing progress");
            }
            if (modelsRef.current[item.id]) {
              return;
            }
            const next = await loadReadingDeskModel(item, library, itemProgress);
            if (cancelled) {
              return;
            }
            modelsRef.current[item.id] = next;
          }),
        );
        if (cancelled) {
          return;
        }
        const index = 0;
        const readyModel = modelsRef.current[inProgressList[index].id];
        if (!readyModel) {
          setPhase("empty");
          return;
        }
        setCoursePage(index);
        setModel(readyModel);
        setCurrent(readyModel.openIndex);
        setOpen(false);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("failed");
        }
      } finally {
        if (!cancelled) {
          setDeskLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inProgressList, library, progress]);

  if (phase === "failed") {
    return (
      <p className="ae-home-kicker ae-home-status">Your reading desk could not be loaded.</p>
    );
  }
  if (phase === "empty") {
    return null;
  }
  if (phase !== "ready" || !model || deskLoading) {
    return (
      <>
        {inProgressList.length > 1 ? (
          <div className="ae-home-pager-slot">
            <ReadingCoursePager
              className="ae-course-pager--above-desk"
              page={Math.min(coursePage, inProgressList.length - 1)}
              pageCount={inProgressList.length}
              onNext={() => showCachedCourse(coursePage + 1)}
              onPrevious={() => showCachedCourse(coursePage - 1)}
            />
          </div>
        ) : null}
        <p className="ae-home-kicker ae-home-status">Loading your reading desk.</p>
      </>
    );
  }

  const opened = open || compact;
  const shown = model.modules[current] ?? model.modules[0];
  const coursePageCount = inProgressList.length;
  const safeCoursePage = Math.min(coursePage, coursePageCount - 1);

  function show(index: number) {
    setCurrent(index);
    setOpen(true);
  }

  const homePager =
    coursePageCount > 1 ? (
      <div className="ae-home-pager-slot">
        <ReadingCoursePager
          className="ae-course-pager--above-desk"
          page={safeCoursePage}
          pageCount={coursePageCount}
          onNext={() => showCachedCourse(safeCoursePage + 1)}
          onPrevious={() => showCachedCourse(safeCoursePage - 1)}
        />
      </div>
    ) : null;

  return (
    <>
      {homePager}
      <div className="escena-w">
        <div className={`escena${opened ? " abierta" : ""}`}>
          <div className="intro">
            <span className="ae-home-kicker">01 / Pick up where you left off</span>
            <h2 className="dl-t">{model.headline}</h2>
            <p className="pista">{model.resumeLine}</p>
            <div className="ae-home-progress-caption">
              <span>Your progress</span>
              <span>
                {model.lessonTotal > 0
                  ? `${model.lessonsRead} of ${model.lessonTotal} lessons read`
                  : "No lessons in this course yet"}
              </span>
            </div>
            {model.lessonTotal > 0 ? (
              <div
                className="ae-resume-progress"
                role="progressbar"
                aria-label="Lessons read"
                aria-valuemin={0}
                aria-valuemax={model.lessonTotal}
                aria-valuenow={model.lessonsRead}
                style={{ ["--segments" as string]: String(model.lessonTotal) }}
              >
                {Array.from({ length: model.lessonTotal }, (_, index) => (
                  <i
                    key={index}
                    className={index < model.lessonsRead ? "read" : undefined}
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : null}
            <div className="ae-home-resume-actions">
              <Link className="btn" href={model.continueHref}>
                {model.continueLabel}
                <span className="ar" />
              </Link>
            </div>
          </div>
          {shown ? (
            <div className="cuerpo-c">
              <div className="barra-c">
                <div className="hojear" role="group" aria-label="Browse modules">
                  <button
                    className="hb"
                    type="button"
                    aria-label="Previous module"
                    disabled={current === 0}
                    onClick={() => setCurrent((value) => Math.max(0, value - 1))}
                  >
                    <span className="ar izq" />
                  </button>
                  <span className="hn" aria-live="polite">
                    Module {String(current + 1).padStart(2, "0")}{" "}
                    <i>of {String(model.modules.length).padStart(2, "0")}</i>
                  </span>
                  <button
                    className="hb"
                    type="button"
                    aria-label="Next module"
                    disabled={current >= model.modules.length - 1}
                    onClick={() =>
                      setCurrent((value) => Math.min(model.modules.length - 1, value + 1))
                    }
                  >
                    <span className="ar" />
                  </button>
                </div>
                <button className="cerrar-in" type="button" onClick={() => setOpen(false)}>
                  Close <span aria-hidden="true">×</span>
                </button>
              </div>
              {model.modules.map((module, index) => (
                <article
                  key={module.id}
                  className={`hoja-s pag${index === current ? " on" : ""}`}
                  aria-hidden={index !== current}
                >
                  <span className="margen" aria-hidden="true" />
                  <span className="lab">{module.label}</span>
                  <h2>{module.title}</h2>
                  {module.meta ? (
                    <p className="meta">
                      <span>{module.meta}</span>
                    </p>
                  ) : null}
                  {module.action ? (
                    <div className="acciones">
                      <Link
                        className={module.current ? "btn" : "btn fantasma"}
                        href={module.action.href}
                      >
                        {module.action.label}
                        {module.current ? <span className="ar" /> : null}
                      </Link>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
          <div
            className="tapa-c"
            role={opened ? undefined : "button"}
            tabIndex={opened ? -1 : 0}
            aria-label={opened ? undefined : "Open course folder"}
            onClick={() => {
              if (!compact) {
                setOpen((value) => !value);
              }
            }}
            onKeyDown={(event) => {
              if (opened) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span className="et folder-tab">
              <span className="folder-tab-label">Reading</span>
            </span>
            <div className="cara frente">
              <div className="ae-home-cover-meta">
                <span>{model.kicker}</span>
                <span>Folder {model.folderNumber}</span>
              </div>
              <h2>{model.title}</h2>
              <div className="ae-home-cover-foot">
                <p className="f-meta">
                  {model.modulePosition}
                  <br />
                  {model.currentModuleTitle}
                </p>
                <span className="ae-home-cover-open">
                  Open folder <span className="ar" aria-hidden="true" />
                </span>
              </div>
            </div>
            <div className="cara dorso">
              <div className="ae-home-back-copy">
                <span className="ae-home-back-caption">On your reading desk</span>
                <p className="curso-d">{model.title}</p>
              </div>
              <div className="postit-a">
                <b>
                  {model.lessonTotal > 0
                    ? `${model.lessonsRead} of ${model.lessonTotal}`
                    : "No lessons yet"}
                </b>
                <span>{model.lessonTotal > 0 ? "lessons read" : "in this course"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <section className="ae-home-path" aria-labelledby="ae-home-path-title">
        <div className="ae-home-path-head">
          <h2 id="ae-home-path-title">Your learning path</h2>
          <Link className="ae-home-text-link" href={`/courses/${model.courseId}`}>
            View full course <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ol className="ae-home-steps">
          {model.path.map((step, index) => (
            <li key={`${step.title}-${index}`} className={step.state}>
              <button
                type="button"
                onClick={() => show(index)}
                aria-current={step.state === "current" ? "step" : undefined}
              >
                <span className="n">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
