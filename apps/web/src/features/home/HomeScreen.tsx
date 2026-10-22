"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { rememberOnboardingDraft } from "@/lib/session";

import { MemberFrame } from "./MemberFrame";

const topics = ["Photography", "Music", "Everyday economics"] as const;

const modules = [
  {
    label: "Module 01 · complete",
    title: "Before the drawing",
    lessons: [
      ["01", "What an architect sees", "Read"],
      ["02", "The inherited city", "Read"],
      ["03", "The profession and its promise", "Read"],
    ],
    done: true,
  },
  {
    label: "Module 02 · Lesson 2 of 3",
    title: "Who decides what a city looks like?",
    lead: "Pick up where you left off.",
    meta: "3 min read",
    current: true,
  },
  {
    label: "Module 03 · ready to read",
    title: "Materials and the rules",
    lessons: [
      ["01", "Concrete, glass, and politics", "1 min"],
      ["02", "Height, density, and the law", "1 min"],
      ["03", "Who pays for the shape of a city?", "1 min"],
    ],
  },
  {
    label: "Module 04 · prepared when you start module 03",
    title: "The city after the plan",
    lessons: [
      ["01", "Renovation and repair", "Queued"],
      ["02", "Life after the plan", "Queued"],
      ["03", "Reading a city today", "Queued"],
    ],
    queued: true,
  },
] as const;

const path = [
  { title: "Before the drawing", detail: "Complete", state: "done" },
  { title: "The city as a machine", detail: "You’re here · Lesson 2 of 3", state: "current" },
  { title: "Materials and the rules", detail: "Ready to read", state: "" },
  { title: "The city after the plan", detail: "Not yet prepared", state: "" },
] as const;

const ideas = [
  {
    tab: "People and places",
    number: "No. 01",
    title: "Writing the city",
    color: "#191C37",
    tone: "",
    blurb:
      "From Arlt to Caparrós: writing a city by walking it, noticing its details, and choosing what to leave unsaid.",
    learn: "Read a piece of urban reportage and recognize its method: where the writer stood, what they chose to tell, and what they left out.",
    about: [
      "Reportage starts with a journey: someone was there and decided what to tell. This course follows that method from Arlt’s newspaper sketches to contemporary Latin American writing, with the city as both subject and form.",
      "Each module reads complete pieces and examines how they work: the observer’s distance, the detail that stands for the whole, the telling silence. It ends with a guide to reading, and beginning to write, your own city.",
    ],
    modules: ["Walking to write", "Finding the right distance", "The detail that holds the whole", "What goes unsaid"],
  },
  {
    tab: "Ways of seeing",
    number: "No. 02",
    title: "What a photograph reveals",
    color: "#C6D4DF",
    tone: "claro",
    blurb:
      "Read a photograph as both a document and a decision: framing, light, time, and everything outside the frame.",
    learn: "Look at a photograph and explain what it shows, suggests, and conceals, beyond simply liking it.",
    about: [
      "Before it is an image, a photograph is a selection. This course teaches you to read that selection: what the frame decided, how light recorded time, and what was deliberately left outside.",
      "The same method carries through documentary, advertising, and phone photography. You’ll develop reasons for your judgments, beyond a photograph’s immediate appeal.",
    ],
    modules: ["The frame and what it leaves out", "Light and time", "Document or fiction", "The everyday photograph"],
  },
  {
    tab: "How things work",
    number: "No. 03",
    title: "The economics of a cup of coffee",
    color: "#372018",
    tone: "",
    blurb: "Everything between the bean and the cup: prices, margins, labor, and why coffee costs what it does.",
    learn: "Trace the price of a coffee through its supply chain and identify where the value stays.",
    about: [
      "A cup of coffee brings together a chain of decisions: who grows, transports, roasts, and serves it. The course follows that chain through actual figures, examining who retains value at each stage.",
      "No background in economics is needed: each concept enters when the coffee calls for it. You’ll leave with a way to read the price of an everyday product as you would a map.",
    ],
    modules: ["From the bean to the port", "Roast, grind, sell", "Price isn’t cost", "The cost of serving"],
  },
] as const;

export function HomeScreen() {
  return (
    <MemberFrame current="home" status={<Status />}>
      <main id="ae-home-main">
        <header className="ae-home-welcome">
          <div>
            <span className="ae-home-kicker">Auteur Education · Your space</span>
            <h1>Your reading desk.</h1>
          </div>
          <Link className="ae-home-text-link" href="/onboarding">
            Create a new course <span className="ae-link-arrow" aria-hidden="true">↗</span>
          </Link>
        </header>
        <ReadingDesk />
        <NewQuestion />
        <Curiosity />
      </main>
    </MemberFrame>
  );
}

function Status() {
  return (
    <>
      <b>1</b> course in progress
    </>
  );
}

function ReadingDesk() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(1);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const apply = () => {
      setCompact(media.matches);
      if (media.matches) setOpen(true);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  function show(index: number) {
    setCurrent(index);
    setOpen(true);
  }

  const opened = open || compact;

  return (
    <>
      <div className="escena-w">
        <div className={`escena${opened ? " abierta" : ""}`}>
          <div className="intro">
            <span className="ae-home-kicker">01 / Pick up where you left off</span>
            <h2 className="dl-t">Who decides what a city looks like?</h2>
            <p className="pista">Module 02 · Lesson 02 · 3 min read</p>
            <div className="ae-home-progress-caption">
              <span>Your progress</span>
              <span>4 of 12 lessons read</span>
            </div>
            <div
              className="ae-resume-progress"
              role="progressbar"
              aria-label="Lessons read"
              aria-valuemin={0}
              aria-valuemax={12}
              aria-valuenow={4}
            >
              {Array.from({ length: 12 }, (_, index) => (
                <i key={index} className={index < 4 ? "read" : undefined} aria-hidden="true" />
              ))}
            </div>
            <div className="ae-home-resume-actions">
              <button className="btn" type="button" onClick={() => show(1)}>
                Continue reading<span className="ar" />
              </button>
            </div>
          </div>
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
                  Module 0{current + 1} <i>of 04</i>
                </span>
                <button
                  className="hb"
                  type="button"
                  aria-label="Next module"
                  disabled={current === modules.length - 1}
                  onClick={() => setCurrent((value) => Math.min(modules.length - 1, value + 1))}
                >
                  <span className="ar" />
                </button>
              </div>
              <button className="cerrar-in" type="button" onClick={() => setOpen(false)}>
                Close <span aria-hidden="true">×</span>
              </button>
            </div>
            {modules.map((module, index) => (
              <article
                key={module.title}
                className={`hoja-s pag${index === current ? " on" : ""}`}
                aria-hidden={index !== current}
              >
                <span className="margen" aria-hidden="true" />
                <span className="lab">{module.label}</span>
                <h2>{module.title}</h2>
                {"lead" in module ? <p className="baj">{module.lead}</p> : null}
                {"meta" in module ? (
                  <p className="meta">
                    <span>{module.meta}</span>
                  </p>
                ) : null}
                {"lessons" in module ? (
                  <ol className="cls-s">
                    {module.lessons.map(([number, title, mark]) => (
                      <li
                        key={title}
                        className={"done" in module && module.done ? "ok" : "queued" in module && module.queued ? "cola" : ""}
                      >
                        <span className="k">{number}</span>
                        <span className="t">{title}</span>
                        <span className="e">{mark}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <div className="acciones">
                  {"current" in module ? (
                    <span className="btn">
                      Continue reading<span className="ar" />
                    </span>
                  ) : "done" in module ? (
                    <span className="btn fantasma">Review the module</span>
                  ) : !("queued" in module) ? (
                    <span className="btn fantasma">View module overview</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <div
            className="tapa-c"
            role={opened ? undefined : "button"}
            tabIndex={opened ? -1 : 0}
            aria-label={opened ? undefined : "Open course folder"}
            onClick={() => {
              if (!compact) setOpen((value) => !value);
            }}
            onKeyDown={(event) => {
              if (opened) return;
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
                <span>Architecture · Urbanism</span>
                <span>Folder 01</span>
              </div>
              <h2>Modern architecture and the city</h2>
              <div className="ae-home-cover-foot">
                <p className="f-meta">
                  Module 02 of 04
                  <br />
                  The city as a machine
                </p>
                <span className="ae-home-cover-open">
                  Open folder <span className="ar" aria-hidden="true" />
                </span>
              </div>
            </div>
            <div className="cara dorso">
              <div>
                <span className="ae-home-back-caption">On your reading desk</span>
                <p className="curso-d">Modern architecture and the city</p>
              </div>
              <div className="postit-a">
                <b>View notes</b>
                <span>4 notes in this course</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <section className="ae-home-path" aria-labelledby="ae-home-path-title">
        <div className="ae-home-path-head">
          <h2 id="ae-home-path-title">Your learning path</h2>
          <Link className="ae-home-text-link" href="/my-courses">
            View full course <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ol className="ae-home-steps">
          {path.map((step, index) => (
            <li key={step.title} className={step.state}>
              <button type="button" onClick={() => show(index)} aria-current={step.state === "current" ? "step" : undefined}>
                <span className="n">0{index + 1}</span>
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

function NewQuestion() {
  const router = useRouter();
  const [question, setQuestion] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (text) {
      rememberOnboardingDraft({
        initial_intent: text,
        experience_level: "Beginner",
        prior_knowledge: null,
        expected_outcome: "",
      });
    }
    router.push("/onboarding");
  }

  return (
    <section className="cnuevo" aria-labelledby="qNueva">
      <form className="cn-f" onSubmit={submit}>
        <span className="k">02 / A new question</span>
        <label id="qNueva" className="cn-h1" htmlFor="q1">
          What’s on your mind?
        </label>
        <div className="cn-der">
          <div className="cn-linea">
            <input
              id="q1"
              type="text"
              autoComplete="off"
              placeholder="A subject, a question…"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </div>
          <div className="ae-home-suggestions" role="group" aria-label="Course ideas">
            <span>Try a subject</span>
            {topics.map((topic) => (
              <button key={topic} type="button" onClick={() => setQuestion(topic)}>
                {topic}
              </button>
            ))}
          </div>
          <button className="btn" type="submit">
            Create my course<span className="ar" />
          </button>
        </div>
      </form>
    </section>
  );
}

function Curiosity() {
  const [open, setOpen] = useState<number | null>(null);
  const idea = open === null ? null : ideas[open];

  return (
    <section className="cursos">
      <div className="ae-home-explore-head">
        <div>
          <span className="ae-home-kicker">03 / Follow your curiosity</span>
          <h2>Worth exploring.</h2>
        </div>
      </div>
      <div className={`col-w${idea ? " abierta" : ""}`}>
        <div className="col-grid">
          {ideas.map((course, index) => (
            <article
              key={course.title}
              className={course.tone === "claro" ? "cc niebla" : "cc"}
              style={{ ["--tabc" as string]: course.color }}
            >
              <button
                className="carp-c"
                type="button"
                aria-expanded={open === index}
                onClick={() => setOpen(index)}
              >
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
                    <span className="ar" />
                  </span>
                </span>
              </button>
            </article>
          ))}
        </div>
        {idea ? (
          <div className="col-pliegos">
            <article className="pliego" style={{ ["--c" as string]: idea.color, ["--tx" as string]: idea.tone === "claro" ? "var(--tinta)" : "#F2F0EF" }}>
              <div className="izq">
                <div className="tarj">
                  <span className="lab">What you’ll learn to do</span>
                  <h3>{idea.title}</h3>
                  <p>{idea.learn}</p>
                </div>
                <div className="nums">
                  <div>
                    <b>4</b>modules
                  </div>
                  <div>
                    <b>12</b>lessons
                  </div>
                  <div>
                    <b>3 hr</b>reading
                  </div>
                  <div>
                    <b>4</b>quizzes
                  </div>
                </div>
              </div>
              <div className="papel-c">
                <span className="lab">What the course covers</span>
                {idea.about.map((paragraph) => (
                  <p className="sint" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
                <span className="lab">The four modules</span>
                <ol>
                  {idea.modules.map((title, index) => (
                    <li key={title}>
                      <span className="k">0{index + 1}</span>
                      <span>{title}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="pie-p">
                <Link className="btn claro" href="/onboarding">
                  Choose your learning path<span className="ar" />
                </Link>
                <button className="cerrar-c" type="button" onClick={() => setOpen(null)}>
                  Close folder
                </button>
              </div>
            </article>
          </div>
        ) : null}
      </div>
    </section>
  );
}
