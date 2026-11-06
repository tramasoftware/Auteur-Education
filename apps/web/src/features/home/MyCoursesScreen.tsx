"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { courses } from "@/lib/api";
import {
  byCreation,
  folderStatusLabel,
  inProgressCount,
  inProgressCourses,
  readingCardCopy,
  resumeHref,
} from "@/lib/course-progress";
import {
  currentUserId,
  readMemberDisplay,
  writeMemberDisplay,
} from "@/lib/member-display";
import { ReadingCoursePager } from "./ReadingCoursePager";
import type { CourseList, CourseProgress, LibraryCourse } from "@/types/generator";

import { LearningStatusLine } from "./LearningStatusLine";
import { MemberFrame } from "./MemberFrame";

/** Muted folder colors. The oldest course is always the first swatch.
 *  Each newer course takes the next swatch. Past the last one, the list repeats.
 */
const FOLDER_COLORS = [
  { color: "#C6D4DF", claro: true },
  { color: "#372018", claro: false },
  { color: "#D4CBC2", claro: true },
  { color: "#191C37", claro: false },
  { color: "#C5C0B4", claro: true },
  { color: "#3D2C2A", claro: false },
  { color: "#B7C4CE", claro: true },
  { color: "#243044", claro: false },
  { color: "#D8D2C8", claro: true },
  { color: "#4A3034", claro: false },
] as const;

type FolderCourse = {
  id: string;
  n: string;
  title: string;
  created: string;
  subtitle: string;
  objective: string;
  modules: number;
  lessons: number;
  href: string;
  color: string;
  claro: boolean;
};

function pad(index: number): string {
  return String(index).padStart(2, "0");
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function stamp(label: string, value: string): string {
  const date = shortDate(value);
  return date ? `${label} · ${date}` : label;
}

function folderFrom(item: LibraryCourse, index: number): FolderCourse {
  const palette = FOLDER_COLORS[index % FOLDER_COLORS.length];

  return {
    id: item.id,
    n: pad(index + 1),
    title: item.title,
    created: stamp("Created", item.created_at),
    subtitle: item.subtitle.trim(),
    objective: item.objective_statement.trim(),
    modules: item.module_count,
    lessons: item.lesson_count,
    href: `/courses/${item.id}`,
    color: palette.color,
    claro: palette.claro,
  };
}

const READING_PAGE_SIZE = 3;

const chosen = [
  {
    tab: "From Read a building",
    title: "Who pays for the shape of a city?",
    blurb: "Land, credit, and rent: the city that money makes possible, and the city it doesn’t.",
    color: "#191C37",
  },
  {
    tab: "From your highlights",
    title: "Reading Jane Jacobs today",
    blurb: "The sidewalk’s challenge to the master plan: what still holds, sixty years later.",
    color: "#C6D4DF",
  },
  {
    tab: "From your searches",
    title: "Read a plan without being an architect",
    blurb: "Scale, orientation, dimensions, and what the drawing leaves unsaid: a way to read a plan as you would a text.",
    color: "#372018",
  },
  {
    tab: "From your current course",
    title: "Buenos Aires, four decisions",
    blurb: "The 1944 code, the highways, Puerto Madero, and the 2018 code: four decisions that explain the city today.",
    color: "#191C37",
  },
] as const;

export function MyCoursesScreen() {
  const [created, setCreated] = useState<FolderCourse[] | null>(null);
  const [library, setLibrary] = useState<LibraryCourse[]>([]);
  const [progress, setProgress] = useState<Map<string, CourseProgress>>(new Map());
  const [failed, setFailed] = useState(false);
  const [readingPage, setReadingPage] = useState(0);

  const showLibrary = useCallback((body: CourseList) => {
    setLibrary(body.courses);
    setProgress(new Map(body.courses.map((item) => [item.id, item.progress])));
    setCreated(byCreation(body.courses).map((item, index) => folderFrom(item, index)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const userId = await currentUserId();
      const cached = userId ? readMemberDisplay(userId) : null;
      if (cancelled) {
        return;
      }
      if (cached?.library) {
        showLibrary(cached.library);
      }
      try {
        const body = await courses.list();
        if (cancelled) {
          return;
        }
        showLibrary(body);
        if (userId) {
          writeMemberDisplay(userId, {
            library: body,
            inProgressCount: inProgressCount(
              body.courses,
              new Map(body.courses.map((item) => [item.id, item.progress])),
            ),
          });
        }
      } catch {
        if (!cancelled && !cached?.library) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showLibrary]);

  const studying = inProgressCount(library, progress);
  const reading = inProgressCourses(library, progress);
  const readingPageCount = Math.max(1, Math.ceil(reading.length / READING_PAGE_SIZE));
  const safeReadingPage = Math.min(readingPage, readingPageCount - 1);
  const readingSlice = reading.slice(
    safeReadingPage * READING_PAGE_SIZE,
    safeReadingPage * READING_PAGE_SIZE + READING_PAGE_SIZE,
  );

  return (
    <MemberFrame
      current="courses"
      status={
        created === null && !failed ? (
          <>Loading</>
        ) : (
          <LearningStatusLine count={studying} variant="header" />
        )
      }
    >
      <section className="hola">
        <h1>My courses</h1>
        <p className="estado">
          <LearningStatusLine count={studying} variant="library" />
          {created ? (
            <>
              {" "}
              · <b>{created.length}</b> in your collection
            </>
          ) : null}
        </p>
      </section>
      {reading.length > 0 ? (
        <section className="cursos">
          <span className="lab">On your reading desk</span>
          <div className="ae-reading-row ae-reading-row--triple">
            {readingSlice.map((item) => {
              const itemProgress = progress.get(item.id);
              if (!itemProgress) {
                return null;
              }
              const card = readingCardCopy(item, itemProgress);
              return (
                <Link className="cf encurso" href={resumeHref(item.id, itemProgress)} key={item.id}>
                  <span className="solapa folder-tab">
                    <span className="folder-tab-label">Reading</span>
                  </span>
                  <span className="cuerpo">
                    <b>{item.title}</b>
                    <span className="d">{card.blurb}</span>
                    <span className="pie">
                      <span>{card.fraction}</span>
                      <span className="prog">
                        <i style={{ width: `${card.percent}%` }} />
                      </span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
          <ReadingCoursePager
            page={safeReadingPage}
            pageCount={readingPageCount}
            onNext={() => setReadingPage((value) => Math.min(value + 1, readingPageCount - 1))}
            onPrevious={() => setReadingPage((value) => Math.max(0, value - 1))}
          />
        </section>
      ) : null}
      <section className="cursos">
        <span className="lab">Courses you’ve created</span>
        {failed ? <p>Your courses could not be loaded.</p> : null}
        {created === null && !failed ? <p>Loading your courses.</p> : null}
        {created?.length === 0 ? <p>No courses yet. They appear here after you create one.</p> : null}
        {created && created.length > 0 ? (
        <div className="cajon">
          {created.map((item) => {
            const status = progress.get(item.id);
            return (
            <article
              key={item.id}
              className={`carp${item.claro ? " claro" : ""}`}
              style={{
                ["--c" as string]: item.color,
                ["--tabc" as string]: item.color,
              }}
            >
              <span className="pest folder-tab">
                <span className="folder-tab-label">
                  <span className="n">{item.n}</span>
                  {item.title}
                </span>
              </span>
              <div className="cu">
                {status ? (
                  <span className="estado">
                    <i aria-hidden="true" />
                    {folderStatusLabel(status)}
                  </span>
                ) : null}
                <div className="ficha-c">
                  <span className="k">{item.created}</span>
                  {item.subtitle ? <p className="sub">{item.subtitle}</p> : null}
                  {item.objective ? <p className="obj">{item.objective}</p> : null}
                  <div className="datos">
                    <div className="m">
                      <span>
                        <b>{item.modules}</b>
                        modules
                      </span>
                      <span>
                        <b>{item.lessons}</b>
                        lessons
                      </span>
                    </div>
                    <Link className="abrir" href={item.href}>
                      Open the course <span className="ar" />
                    </Link>
                  </div>
                </div>
              </div>
            </article>
            );
          })}
        </div>
        ) : null}
      </section>
      <section className="cursos">
        <span className="lab">Chosen for your reading</span>
        <p>Based on the subjects you’ve explored.</p>
        <div className="col-grid cuatro">
          {chosen.map((item, index) => (
            <article key={item.title} className={item.color === "#C6D4DF" ? "cc niebla" : "cc"} style={{ ["--tabc" as string]: item.color }}>
              <div className="carp-c">
                <span className="sol-c folder-tab">
                  <span className="folder-tab-label">{item.tab}</span>
                </span>
                <span className="cu-c">
                  <span className="fila-c">
                    <span>Auteur Education</span>
                    <span>No. 0{index + 1}</span>
                  </span>
                  <h3>{item.title}</h3>
                  <span className="pie-c">
                    <span>4 modules · 12 lessons</span>
                    <span className="ar" />
                  </span>
                </span>
              </div>
              <p>{item.blurb}</p>
            </article>
          ))}
        </div>
      </section>
    </MemberFrame>
  );
}
