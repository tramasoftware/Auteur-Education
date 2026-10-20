"use client";

import { useEffect, useRef } from "react";

const courses = [
  {
    tab: "People and places",
    number: "No. 01",
    title: "Writing the city",
    color: "#191C37",
    tone: "ink",
    sheets: ["Field notes", "Cities & people", "Essays", "Your course"],
  },
  {
    tab: "Ways of seeing",
    number: "No. 02",
    title: "What a photograph reveals",
    color: "#C6D4DF",
    tone: "mist",
    sheets: ["Observations", "Images & ideas", "Research", "Your course"],
  },
  {
    tab: "How things work",
    number: "No. 03",
    title: "The economics of a cup of coffee",
    color: "#372018",
    tone: "ink",
    sheets: ["Everyday systems", "Research", "Connections", "Your course"],
  },
] as const;

const sheetVectors = [
  [-135, -145, -18],
  [165, -180, 15],
  [-48, -245, -9],
  [105, -210, 12],
] as const;

const sheetAngles = [-3, 2, -1, 1] as const;

function mountFolderArrival(grid: HTMLElement) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cards = Array.from(grid.querySelectorAll<HTMLElement>("[data-ae-folder-arrival]"));
  const builds = new Map<HTMLElement, Animation[]>();
  const finished = new Set<HTMLElement>();
  let disposed = false;
  let observer: IntersectionObserver | null = null;

  function finishFolder(card: HTMLElement) {
    finished.add(card);
    const work = builds.get(card);
    builds.delete(card);
    card.dataset.aeFolderState = "ready";
    card.classList.remove("ae-reveal-pending");
    work?.forEach((animation) => animation.cancel());
    card.querySelectorAll<HTMLElement>(".ae-arrival-back, .ae-arrival-inserts").forEach((node) => {
      node.hidden = true;
    });
  }

  function buildFolder(card: HTMLElement) {
    if (finished.has(card) || builds.has(card)) return;
    const folder = card.querySelector<HTMLElement>(".carp-c");
    const cover = card.querySelector<HTMLElement>(".ae-arrival-cover");
    if (reduced.matches || document.hidden || !folder || typeof folder.animate !== "function") {
      finishFolder(card);
      return;
    }

    card.classList.remove("ae-reveal-pending");
    card.dataset.aeFolderState = "building";
    card.querySelectorAll<HTMLElement>(".ae-arrival-back, .ae-arrival-inserts").forEach((node) => {
      node.hidden = false;
    });

    const work: Animation[] = [];
    const index = Number(card.dataset.aeFolderArrival);
    const delay = window.innerWidth > 860 ? index * 130 : 0;
    const direction = index - 1;
    const stamp = document.timeline?.currentTime;
    builds.set(card, work);

    function animate(node: HTMLElement, keys: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = node.animate(keys, { fill: "both", ...options });
      if (typeof stamp === "number") animation.startTime = stamp;
      work.push(animation);
    }

    try {
      animate(
        folder,
        [
          {
            transform: `translate3d(${direction * 24}px,72px,0) rotate(${direction * 3}deg) scale(.94)`,
            opacity: 0,
          },
          { transform: "translate3d(0,0,0) rotate(0deg) scale(1)", opacity: 1 },
        ],
        { duration: 760, delay, easing: "cubic-bezier(.16,1,.3,1)" },
      );
      animate(
        cover,
        [
          { transform: "rotateX(-48deg)", offset: 0 },
          { transform: "rotateX(-48deg)", offset: 0.58 },
          { transform: "rotateX(-17deg)", offset: 0.79 },
          { transform: "rotateX(1.2deg)", offset: 0.95 },
          { transform: "rotateX(0deg)", offset: 1 },
        ],
        { duration: 1850, delay, easing: "cubic-bezier(.4,0,.2,1)" },
      );
      card.querySelectorAll<HTMLElement>(".ae-arrival-sheet").forEach((sheet, sheetIndex) => {
        const vector = sheetVectors[sheetIndex];
        const finalAngle = sheetAngles[sheetIndex];
        if (!vector || finalAngle === undefined) return;
        animate(
          sheet,
          [
            {
              transform: `translate3d(${vector[0]}px,${vector[1]}px,0) rotate(${vector[2]}deg) scale(1.08)`,
              opacity: 0,
              offset: 0,
            },
            { opacity: 1, offset: 0.12 },
            {
              transform: `translate3d(0,-3px,0) rotate(${finalAngle}deg) scale(.96)`,
              opacity: 1,
              offset: 1,
            },
          ],
          { duration: 690, delay: delay + 250 + sheetIndex * 125, easing: "cubic-bezier(.23,1,.32,1)" },
        );
      });
      void Promise.all(work.map((animation) => animation.finished.catch(() => undefined))).then(() => {
        if (!disposed && builds.has(card)) finishFolder(card);
      });
    } catch {
      finishFolder(card);
    }
  }

  function settleBuilds() {
    Array.from(builds.keys()).forEach(finishFolder);
  }

  function preference() {
    if (reduced.matches) {
      cards.forEach((card) => card.classList.remove("ae-reveal-pending"));
      cards.forEach(finishFolder);
    }
  }

  if (!reduced.matches && "IntersectionObserver" in window) {
    cards.forEach((card) => card.classList.add("ae-reveal-pending"));
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const node = entry.target;
          if (!(node instanceof HTMLElement)) return;
          buildFolder(node);
          observer?.unobserve(node);
        });
      },
      { threshold: 0.01, rootMargin: "0px 0px 96px 0px" },
    );
    cards.forEach((card) => observer?.observe(card));
  } else {
    cards.forEach(finishFolder);
  }

  function interact(event: Event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const card = target.closest<HTMLElement>("[data-ae-folder-arrival]");
    if (!card || !grid.contains(card)) return;
    finishFolder(card);
  }

  function onVisibility() {
    if (document.hidden) settleBuilds();
  }

  document.addEventListener("focusin", interact);
  document.addEventListener("pointerdown", interact);
  window.addEventListener("resize", settleBuilds);
  document.addEventListener("visibilitychange", onVisibility);
  reduced.addEventListener("change", preference);

  return () => {
    disposed = true;
    settleBuilds();
    observer?.disconnect();
    cards.forEach((card) => card.classList.remove("ae-reveal-pending"));
    document.removeEventListener("focusin", interact);
    document.removeEventListener("pointerdown", interact);
    window.removeEventListener("resize", settleBuilds);
    document.removeEventListener("visibilitychange", onVisibility);
    reduced.removeEventListener("change", preference);
  };
}

export function CourseFolders() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    return mountFolderArrival(grid);
  }, []);

  return (
    <div className="col-grid" ref={gridRef}>
      {courses.map((course, index) => (
        <article
          key={course.number}
          className={course.tone === "mist" ? "cc niebla" : "cc"}
          data-ae-folder-arrival={index}
          data-ae-folder-state="waiting"
          style={{ ["--tabc" as string]: course.color }}
        >
          <div className="carp-c">
            <span className="ae-arrival-back" aria-hidden="true" hidden>
              <span className="folder-tab" />
            </span>
            <span className="ae-arrival-inserts" aria-hidden="true" hidden>
              {course.sheets.map((label) => (
                <span className="ae-arrival-sheet" key={label}>
                  <span>{label}</span>
                </span>
              ))}
            </span>
            <span className="ae-arrival-cover">
              <span className="sol-c folder-tab">
                <span className="folder-tab-label">{course.tab}</span>
              </span>
              <span className="cu-c">
                <span className="fila-c">
                  <span>Auteur Education</span>
                  <span>{course.number}</span>
                </span>
                <h3>{course.title}</h3>
                <span className="pie-c">
                  <span>4 modules · 12 lessons</span>
                  <span className="ar" aria-hidden="true" />
                </span>
              </span>
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
