import Link from "next/link";

import { EditorialFrame } from "./EditorialFrame";

const beliefs = [
  {
    mark: "I.",
    title: "Your question comes first",
    text: "Tell us what interests you and where you’re starting from.",
  },
  {
    mark: "II.",
    title: "A path with a purpose",
    text: "Ideas, examples, and exercises, with sources you can check.",
  },
  {
    mark: "III.",
    title: "Read the first lesson free",
    text: "Create an account to read your first lesson. Pay only when you choose to continue.",
  },
  {
    mark: "IV.",
    title: "A collection that grows with you",
    text: "Your courses, notes, and summaries, together in one place.",
  },
] as const;

export function AboutPage() {
  return (
    <EditorialFrame current="about">
      <main className="lp">
        <section className="lp-port">
          <span className="k">About</span>
          <h1>Understanding changes what you can do</h1>
          <p className="sub">A question can open a dozen tabs. Auteur gives it a clear path.</p>
        </section>
        <section className="lp-sec lp-dos">
          <div>
            <h2>What we believe</h2>
            <div className="txt">
              <p>Your goal and starting point shape what you learn, and how the course unfolds.</p>
              <p>History, technique, and competing ideas give you grounds for forming your own judgment.</p>
              <p>
                When you finish, your notes and the course’s key ideas come together in a summary you
                can return to.
              </p>
              <p className="firma">Think for yourself. Have reasons for what you think.</p>
            </div>
          </div>
          <ul className="lista-m">
            {beliefs.map((belief) => (
              <li key={belief.mark}>
                <span className="r">{belief.mark}</span>
                <div>
                  <b>{belief.title}</b>
                  <p>{belief.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="lp-sec lp-cierre">
          <Link className="btn" href="/onboarding">
            Create my course
            <span className="ar" aria-hidden="true" />
          </Link>
        </section>
      </main>
    </EditorialFrame>
  );
}
