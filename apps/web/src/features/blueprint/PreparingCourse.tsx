"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import "./preparing-course.css";

const PHASES = [
  "Putting the course outline in order…",
  "Preparing the lessons…",
  "Reviewing the sources…",
];

const ANGLES = [-1, 1.3, -1.5, 0.7, -0.8, 0.5];
const VECTORS: Array<[number, number]> = [
  [-1, -0.3],
  [1, 0.2],
  [-0.6, 1],
  [1, -0.25],
  [0.6, 1],
  [-1, 0.35],
];

const MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export type PreparingSheet = {
  label: string;
  title: string;
  lines: number[];
};

type PreparingCourseProps = {
  title: string;
  subtitle: string;
  sheets: PreparingSheet[];
  coverKicker: string;
  coverLabel: string;
  coverTitle: string;
  /** True once approve has saved the course for this user. */
  courseReady: boolean;
  courseHref: string | null;
};

function sealDate(date = new Date()) {
  return `${date.getDate()}.${MONTHS[date.getMonth()]}.${String(date.getFullYear()).slice(2)}`;
}

/**
 * Screen 09. The bar follows the sheet flight from the prototype; the API
 * does not report a generation percent. The button stays inactive until that
 * flight ends and the course row exists.
 */
export function PreparingCourse({
  title,
  subtitle,
  sheets,
  coverKicker,
  coverLabel,
  coverTitle,
  courseReady,
  courseHref,
}: PreparingCourseProps) {
  const sealId = useId().replace(/:/g, "");
  const coverRef = useRef<HTMLDivElement>(null);
  const leafRefs = useRef<Array<HTMLDivElement | null>>([]);
  const courseReadyRef = useRef(courseReady);
  const visualDoneRef = useRef(false);
  const completeRef = useRef<() => void>(() => {});
  const [heading, setHeading] = useState("Your course is taking shape");
  const [phase, setPhase] = useState(PHASES[0]);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const barLock = useRef(false);

  useEffect(() => {
    courseReadyRef.current = courseReady;
    if (courseReady && visualDoneRef.current) {
      completeRef.current();
    }
  }, [courseReady]);

  useEffect(() => {
    const cover = coverRef.current;
    const leaves = leafRefs.current.filter((node): node is HTMLDivElement => node !== null);
    let disposed = false;
    let settled = false;
    let completed = false;
    const animations: Animation[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const land = (index: number) =>
      `translate3d(${index * 5}px,${index * 5}px,0) rotate(${ANGLES[index] ?? 0}deg) scale(1)`;

    const clear = () => {
      animations.forEach((animation) => animation.cancel());
      animations.length = 0;
      leaves.forEach((node) => {
        node.style.willChange = "auto";
      });
    };

    const complete = () => {
      if (completed || disposed || !courseReadyRef.current) {
        return;
      }
      completed = true;
      barLock.current = true;
      setProgress(100);
      setHeading("Your course is ready");
      setReady(true);
    };
    completeRef.current = complete;

    const settle = () => {
      if (settled || disposed) {
        return;
      }
      settled = true;
      clear();
      leaves.forEach((node, index) => {
        node.style.visibility = "visible";
        node.style.transform = land(index);
      });
      if (cover) {
        cover.style.opacity = "1";
        cover.style.transform = "rotate(-1.2deg)";
        cover.classList.add("va");
      }
      visualDoneRef.current = true;
      complete();
    };

    const flight = (node: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = node.animate(keyframes, options);
      animations.push(animation);
      if (document.hidden) {
        animation.pause();
      }
      return animation.finished.then(() => animation);
    };

    const start = async () => {
      if (reduced.matches || leaves.length === 0 || typeof leaves[0]?.animate !== "function") {
        settle();
        return;
      }
      setPhase(PHASES[0]);
      try {
        await Promise.all(
          leaves.map((node, index) => {
            const vector = VECTORS[index] ?? VECTORS[0];
            node.style.transform = "none";
            const rect = node.getBoundingClientRect();
            let x = vector[0] < 0 ? -rect.right - rect.width : window.innerWidth - rect.left + rect.width;
            const y =
              vector[1] === 1 ? window.innerHeight - rect.top + rect.height : vector[1] * window.innerHeight;
            if (vector[1] === 1) {
              x *= 0.5;
            }
            const from = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0) rotate(${vector[0] < 0 ? -24 : 24}deg) scale(1.9)`;
            node.style.transform = land(index);
            node.style.visibility = "visible";
            node.style.willChange = "transform";
            return flight(
              node,
              [{ transform: from }, { transform: land(index) }],
              {
                duration: 1900,
                delay: index * 800,
                easing: "cubic-bezier(.22,.7,.25,1)",
                fill: "both",
              },
            ).then((animation) => {
              if (settled || disposed) {
                return;
              }
              animation.cancel();
              node.style.willChange = "auto";
              node.style.transform = land(index);
              setPhase(PHASES[Math.min(2, Math.floor((index + 1) / 2))]);
            });
          }),
        );
        if (settled || disposed || !cover) {
          if (!disposed) {
            settle();
          }
          return;
        }
        await flight(
          cover,
          [
            { opacity: 0, transform: "translate3d(-64px,18px,0) rotate(-7deg)" },
            { opacity: 1, transform: "rotate(-1.2deg)" },
          ],
          { duration: 850, easing: "cubic-bezier(.22,.7,.25,1)", fill: "forwards" },
        );
        settle();
      } catch {
        if (!disposed) {
          settle();
        }
      }
    };

    const onVisibility = () => {
      if (settled || disposed) {
        return;
      }
      animations.forEach((animation) => {
        if (animation.playState === "finished" || animation.playState === "idle") {
          return;
        }
        if (document.hidden) {
          animation.pause();
        } else {
          animation.play();
        }
      });
    };

    const onPreference = () => {
      if (reduced.matches) {
        settle();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onPreference);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!disposed) {
          void start();
        }
      });
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onPreference);
    };
  }, []);

  useEffect(() => {
    if (ready) {
      return;
    }
    const started = performance.now();
    const approachMs = 24000;
    const timer = window.setInterval(() => {
      if (barLock.current) {
        return;
      }
      const elapsed = performance.now() - started;
      if (elapsed < approachMs) {
        const eased = 1 - (1 - elapsed / approachMs) ** 2.2;
        setProgress(Math.min(94, Math.round(eased * 94)));
        return;
      }
      const extra = Math.min(4, ((elapsed - approachMs) / 14000) * 4);
      setProgress(Math.min(98, Math.round(94 + extra)));
    }, 200);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const href = ready && courseHref ? courseHref : "#";

  return (
    <section className={ready ? "gen listo" : "gen"} aria-busy={!ready}>
      <div>
        <h1>{heading}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
        <div className="reg" aria-live="polite">
          <p className="act">{phase}</p>
        </div>
        <div className="avance">
          <span className="via">
            <i style={{ width: `${progress}%` }} />
          </span>
          <span className="pc">{progress}%</span>
        </div>
        <div className="acciones">
          <Link
            className={ready ? "btn" : "btn espera"}
            href={href}
            aria-disabled={!ready}
            onClick={(event) => {
              if (!ready || !courseHref) {
                event.preventDefault();
              }
            }}
          >
            View my course
            <span className="ar" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="arma" aria-hidden="true">
        <span className="tabc">
          <span>{title}</span>
        </span>
        <div className="cuerpo" />
        {sheets.map((sheet, index) => (
          <div
            className="hoja"
            data-leaf={index}
            key={`${sheet.label}-${sheet.title}`}
            ref={(node) => {
              leafRefs.current[index] = node;
            }}
          >
            <span className="l">{sheet.label}</span>
            <span className="tt">{sheet.title}</span>
            {sheet.lines.map((width, line) => (
              <span className="ln" key={line} style={{ ["--w" as string]: `${width}%` }} />
            ))}
          </div>
        ))}
        <div className="tapa" ref={coverRef}>
          <span className="l">{coverKicker}</span>
          <span className="n">{coverLabel}</span>
          <span className="tt">{coverTitle}</span>
          <svg className="sello" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <path
                id={sealId}
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
              <textPath href={`#${sealId}`}>AUTEUR · ARCHIVE · EDUCATION · MMXXVI · </textPath>
            </text>
            <text
              x="50"
              y="47"
              textAnchor="middle"
              fontFamily="var(--font-editorial), Georgia, serif"
              fontSize="10.5"
              fill="currentColor"
            >
              Prepared
            </text>
            <text
              x="50"
              y="61"
              textAnchor="middle"
              fontFamily="var(--font-editorial), Georgia, serif"
              fontSize="11"
              fill="currentColor"
            >
              {sealDate()}
            </text>
          </svg>
        </div>
      </div>
    </section>
  );
}
