"use client";

import { useId, useState, type ReactNode } from "react";

const questions = [
  {
    summary: "Can I start with no background in the subject?",
    answer: "Yes. Tell us your level when you begin, and the course starts there.",
  },
  {
    summary: "What can I see before I pay?",
    answer:
      "View the course outline before signing up. Create a free account to read the full first lesson—no card needed. Choose a plan when you’re ready for lesson two.",
  },
  {
    summary: "How is a course created?",
    answer:
      "AI helps prepare your course around your question, your goal, and your starting level, with sources you can follow.",
  },
  {
    summary: "What is a course like?",
    answer:
      "Written lessons you can read or listen to, with space for your notes and a quiz at the end of each module.",
  },
  {
    summary: "Can I change the course outline?",
    answer:
      "Yes. In the preview, open “Revise the course outline,” describe your changes, and request a new version.",
  },
  {
    summary: "Are some course requests outside your scope?",
    answer:
      "A course can help you build knowledge and skills. It can’t guarantee an outcome. If you start with a goal, we’ll suggest subjects that help you work toward it.",
  },
] as const;

export function LandingFooter() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <footer className="pie-sitio pie-publico">
      <div className="landing-wrap ae-footer-links">
        <span>Auteur Education</span>
        <button
          className="ae-footer-faq-toggle"
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          FAQs
          <span aria-hidden="true">+</span>
        </button>
        <span>Contact</span>
        <span>Terms of use</span>
        <span className="redes" aria-hidden="true">
          <SocialIcon>
            <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z" />
          </SocialIcon>
          <SocialIcon>
            <path d="M12 3.6c2.7 0 3.1 0 4.1.1 2.7.1 4 1.4 4.1 4.1.1 1.1.1 1.4.1 4.1s0 3.1-.1 4.1c-.1 2.7-1.4 4-4.1 4.1-1.1.1-1.4.1-4.1.1s-3.1 0-4.1-.1c-2.8-.1-4-1.4-4.1-4.1C3.6 15.1 3.6 14.7 3.6 12s0-3.1.1-4.1c.1-2.7 1.4-4 4.1-4.1 1.1-.1 1.4-.1 4.2-.1zM12 2C9.3 2 8.9 2 7.9 2.1 4.2 2.2 2.2 4.2 2.1 7.9 2 8.9 2 9.3 2 12s0 3.1.1 4.1c.2 3.7 2.2 5.7 5.8 5.8 1.1.1 1.4.1 4.1.1s3.1 0 4.1-.1c3.7-.2 5.7-2.2 5.8-5.8.1-1.1.1-1.4.1-4.1s0-3.1-.1-4.1c-.2-3.7-2.2-5.7-5.8-5.8C15.1 2 14.7 2 12 2zm0 4.9a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 8.4a3.3 3.3 0 1 1 0-6.6 3.3 3.3 0 0 1 0 6.6zm5.3-9.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z" />
          </SocialIcon>
          <SocialIcon>
            <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.7 3h6.4l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7.3 4.7H5.5l11.2 14.5z" />
          </SocialIcon>
        </span>
      </div>
      <section
        className="ae-footer-faq-panel"
        id={panelId}
        aria-labelledby="ae-faq-title"
        hidden={!open}
      >
        <div className="landing-wrap ae-footer-faq-grid">
          <div className="ae-footer-faq-heading">
            <span className="ae-footer-eyebrow">Help & information</span>
            <h2 id="ae-faq-title">
              Questions,
              <br />
              answered.
            </h2>
          </div>
          <div className="ae-footer-questions">
            {questions.map((question) => (
              <details key={question.summary}>
                <summary>{question.summary}</summary>
                <p>{question.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </footer>
  );
}

function SocialIcon({ children }: { children: ReactNode }) {
  return (
    <span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    </span>
  );
}
