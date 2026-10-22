"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { courses } from "@/lib/api";
import type { LibraryCourse } from "@/types/generator";

import { MemberFrame } from "./MemberFrame";

/** Muted folder colors in the niebla / brown / ink family. The sequence repeats after ten. */
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

const FOLDER_OFFSETS = ["2%", "34%", "58%", "12%", "42%", "8%", "26%", "50%", "18%", "38%"];

type FolderCourse = {
  id: string;
  n: string;
  title: string;
  when: string;
  subtitle: string;
  objective: string;
  modules: number;
  lessons: number;
  href: string;
  color: string;
  claro: boolean;
  x: string;
  stack: number;
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

function folderFrom(item: LibraryCourse, index: number): FolderCourse {
  const palette = FOLDER_COLORS[index % FOLDER_COLORS.length];
  const date = shortDate(item.updated_at);

  return {
    id: item.id,
    n: pad(index + 1),
    title: item.title,
    when: date ? `Updated · ${date}` : "Updated",
    subtitle: item.subtitle.trim(),
    objective: item.objective_statement.trim(),
    modules: item.module_count,
    lessons: item.lesson_count,
    href: `/courses/${item.id}`,
    color: palette.color,
    claro: palette.claro,
    x: FOLDER_OFFSETS[index % FOLDER_OFFSETS.length],
    stack: index + 1,
  };
}

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    courses
      .list()
      .then((body) => {
        if (cancelled) {
          return;
        }
        setCreated(body.courses.map((item, index) => folderFrom(item, index)));
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MemberFrame
      current="courses"
      status={
        <>
          <b>1</b> course in progress
        </>
      }
    >
      <section className="hola">
        <h1>My courses</h1>
        <p className="estado">
          <b>1</b> in progress
          {created ? (
            <>
              {" "}
              · <b>{created.length}</b> in your collection
            </>
          ) : null}
        </p>
      </section>
      <section className="cursos">
        <span className="lab">On your reading desk</span>
        <div className="ae-reading-row">
          <Link className="cf encurso" href="/home">
            <span className="solapa folder-tab">
              <span className="folder-tab-label">Reading</span>
            </span>
            <span className="cuerpo">
              <b>Modern architecture and the city</b>
              <span className="d">
                How a city takes shape, and who signs off on it. You’re on lesson 2 of 3 in module 02.
              </span>
              <span className="pie">
                <span>4 of 12</span>
                <span className="prog">
                  <i style={{ width: "33%" }} />
                </span>
              </span>
            </span>
          </Link>
        </div>
      </section>
      <section className="cursos">
        <span className="lab">Courses you’ve created</span>
        {failed ? <p>Your courses could not be loaded.</p> : null}
        {created === null && !failed ? <p>Loading your courses.</p> : null}
        {created?.length === 0 ? <p>No courses yet. They appear here after you create one.</p> : null}
        {created && created.length > 0 ? (
        <div className="cajon">
          {created.map((item) => (
            <article
              key={item.id}
              className={`carp${item.claro ? " claro" : ""}`}
              style={{
                ["--c" as string]: item.color,
                ["--tabc" as string]: item.color,
                ["--x" as string]: item.x,
                ["--stack" as string]: String(item.stack),
              }}
            >
              <span className="pest folder-tab">
                <span className="folder-tab-label">
                  <span className="n">{item.n}</span>
                  {item.title}
                </span>
              </span>
              <div className="cu">
                <div className="ficha-c">
                  <span className="k">{item.when}</span>
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
                      <span>
                        <b>3</b>
                        quizzes
                      </span>
                    </div>
                    <Link className="abrir" href={item.href}>
                      Open the course <span className="ar" />
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
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
