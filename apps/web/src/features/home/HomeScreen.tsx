"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { rememberOnboardingDraft } from "@/lib/session";

import { LearningStatusLine } from "./LearningStatusLine";
import { MemberFrame } from "./MemberFrame";
import { ReadingDesk } from "./ReadingDesk";

const topics = ["Photography", "Music", "Everyday economics"] as const;

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

function pad(step: number): string {
  return String(step).padStart(2, "0");
}

export function HomeScreen() {
  const [inProgress, setInProgress] = useState<number | null>(null);

  return (
    <MemberFrame
      current="home"
      status={
        inProgress === null ? (
          <>Loading</>
        ) : (
          <LearningStatusLine count={inProgress} variant="header" />
        )
      }
    >
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
        <ReadingDesk onInProgress={setInProgress} />
        <Curiosity step={2} fromCurrentCourse />
        <NewQuestion step={3} />
      </main>
    </MemberFrame>
  );
}

function NewQuestion({ step }: { step: number }) {
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
        <span className="k">{pad(step)} / A new question</span>
        <label id="qNueva" className="cn-h1" htmlFor="q1">
          What would you like to understand?
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

function Curiosity({ step, fromCurrentCourse }: { step: number; fromCurrentCourse: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const idea = open === null ? null : ideas[open];

  return (
    <section className="cursos">
      <div className="ae-home-explore-head">
        <div>
          <span className="ae-home-kicker">
            {pad(step)} / {fromCurrentCourse ? "From your current course" : "Follow your curiosity"}
          </span>
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
