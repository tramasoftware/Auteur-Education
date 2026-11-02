import Link from "next/link";

import { EditorialFrame } from "./EditorialFrame";

const included = [
  "Written lessons with narration",
  "Your notes and a final course summary",
  "Quizzes to revisit what you’ve learned",
] as const;

export function PlansPage() {
  return (
    <EditorialFrame current="plans">
      <main className="lp">
        <section className="lp-port">
          <span className="k">Plans</span>
          <h1>One course. Or room for more.</h1>
          <p className="sub">
            Your first lesson is free with an account. No card needed. Prices in USD, including VAT.
          </p>
        </section>
        <section className="lp-sec">
          <div className="planes">
            <article className="plan">
              <span className="k">By course</span>
              <h3>One course, yours to keep</h3>
              <p className="precio">
                US$11.99
                <small>per course · VAT included</small>
              </p>
              <p className="ae-plan-terms">One payment. No subscription.</p>
              <ul>
                {included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link className="btn" href="/onboarding">
                Create my course
                <span className="ar" aria-hidden="true" />
              </Link>
            </article>
            <article className="plan destacado">
              <span className="k">Monthly</span>
              <h3>Four courses a month</h3>
              <p className="precio">
                US$25.99
                <small>per month · VAT included</small>
              </p>
              <p className="ae-plan-terms">Billed monthly until you cancel.</p>
              <ul>
                {included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link className="btn" href="/onboarding">
                Create your first course
                <span className="ar" aria-hidden="true" />
              </Link>
            </article>
          </div>
        </section>
      </main>
    </EditorialFrame>
  );
}
