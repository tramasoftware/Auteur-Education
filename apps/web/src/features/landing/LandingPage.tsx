import Link from "next/link";

import { CourseFilm } from "./CourseFilm";
import { CourseFolders } from "./CourseFolders";
import { EditorialFrame } from "./EditorialFrame";

const topics = [
  ["Architecture", "Astronomy", "Film", "Botany", "Philosophy", "Design", "History", "Music"],
  ["Photography", "Cities", "Cooking", "Literature", "Economics", "Gardens", "Science", "Art"],
] as const;

export function LandingPage() {
  return (
    <EditorialFrame>
      <main className="lp">
        <section className="lp-hero">
          <div>
            <span className="k">Courses created with AI</span>
            <h1>Create the course you wish existed.</h1>
            <p className="sub">Built around your question, your goal, and what you already know.</p>
            <div className="cta">
              <CreateCourseLink />
            </div>
            <p className="prom">Your first lesson is free with an account. No card needed.</p>
          </div>
          <CourseFilm />
        </section>

        <section className="lp-sec" id="coleccion">
          <div className="col-cab">
            <div>
              <span className="k">A few places to begin</span>
              <h2>Explore a subject</h2>
            </div>
          </div>
          <CourseFolders />
        </section>

        <section className="ae-topics" aria-labelledby="ae-topics-title">
          <div className="ae-topics-head">
            <h2 id="ae-topics-title">Courses on…</h2>
          </div>
          <div className="ae-topic-window">
            <div className="ae-topic-track">
              <TopicGroup items={topics[0]} />
              <TopicGroup items={topics[0]} hidden />
            </div>
          </div>
          <div className="ae-topic-window ae-topic-window--reverse">
            <div className="ae-topic-track">
              <TopicGroup items={topics[1]} />
              <TopicGroup items={topics[1]} hidden />
            </div>
          </div>
        </section>

        <section className="lp-sec ae-difference ae-ai-panel" aria-labelledby="ae-difference-title">
          <div className="ae-ai-copy">
            <span className="k">Beyond the course catalog</span>
            <h2 id="ae-difference-title">
              Created with AI.
              <br />
              <em>Directed by you.</em>
            </h2>
            <p className="ae-ai-explanation">
              We use trained AI to create a course around your question, goal, and starting point.
            </p>
            <p className="ae-ai-control">
              You can review the outline and ask for changes before you begin.
            </p>
          </div>
          <div className="ae-ai-brief-stage">
            <article className="ae-ai-brief" aria-label="Example of a personal course brief">
              <div className="ae-ai-brief-top">
                <span>Your course brief</span>
                <span aria-hidden="true">↗</span>
              </div>
              <dl>
                <div>
                  <dt>Your question</dt>
                  <dd>Why do some streets invite people to stay?</dd>
                </div>
                <div>
                  <dt>Your starting point</dt>
                  <dd>No background in architecture.</dd>
                </div>
                <div>
                  <dt>Your goal</dt>
                  <dd>Read the city with a more informed eye.</dd>
                </div>
              </dl>
              <p className="ae-ai-brief-end">A syllabus shaped around these answers.</p>
            </article>
            <p className="ae-ai-caption">One question. A course of your own.</p>
          </div>
        </section>

        <section className="lp-sec ae-sources ae-source-editorial" aria-labelledby="ae-sources-title">
          <span className="k">Sources and perspectives</span>
          <h2 id="ae-sources-title">
            Go straight
            <br />
            to <em>the source.</em>
          </h2>
          <p className="ae-source-deck">
            Follow the references. Compare perspectives.
            <br />
            Form a view of your own.
          </p>
          <div className="ae-reference-shelf">
            <span className="ae-reference-caption">Cited in the architecture course</span>
            <div className="ae-reference-links">
              <a
                href="https://betterworld.mit.edu/images-of-the-city/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="ae-reference-type">MIT · Article</span>
                <span className="ae-reference-title">
                  Images of the city
                  <span aria-hidden="true">↗</span>
                </span>
              </a>
              <a
                href="https://www.penguinrandomhouse.com/books/86058/the-death-and-life-of-great-american-cities-by-jane-jacobs/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="ae-reference-type">Jane Jacobs · Book</span>
                <span className="ae-reference-title">
                  The Death and Life of Great American Cities
                  <span aria-hidden="true">↗</span>
                </span>
              </a>
            </div>
          </div>
        </section>

        <section className="ae-landing-close" aria-labelledby="ae-closing-title">
          <div className="ae-closing-copy">
            <h2 id="ae-closing-title">A new question starts here.</h2>
            <p className="ae-closing-price">
              First lesson free. Then US$11.99 per course or US$25.99/month. VAT included.
            </p>
          </div>
          <Link className="btn" href="/onboarding">
            Create my course
            <span className="ar" aria-hidden="true" />
          </Link>
        </section>
      </main>
    </EditorialFrame>
  );
}

function CreateCourseLink() {
  return (
    <Link className="btn ae-create-course" href="/onboarding">
      <span className="ae-create-label">Create my course</span>
      <span className="ae-create-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M4 12h15M13 6l6 6-6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Link>
  );
}

function TopicGroup({ items, hidden = false }: { items: readonly string[]; hidden?: boolean }) {
  return (
    <div className="ae-topic-group" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}
