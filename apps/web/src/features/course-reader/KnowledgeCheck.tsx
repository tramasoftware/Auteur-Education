"use client";

import { useState } from "react";

import { Button, RetryIcon } from "@/components/ui";
import type { KnowledgeCheck as KnowledgeCheckData } from "@/types/generator";

/**
 * UF-07: formative, optional, repeatable, non-certifying. Answers are checked
 * locally; nothing is recorded (student progress is out of demo scope).
 */
export function KnowledgeCheck({ check }: { check: KnowledgeCheckData }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);

  const answered = Object.keys(answers).length === check.questions.length;
  const correct = check.questions.filter(
    (q, i) => answers[i] !== undefined && q.options[answers[i]]?.is_correct,
  ).length;

  const reset = () => {
    setAnswers({});
    setRevealed(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-6">
        {check.questions.map((question, qi) => (
          <li key={qi} className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium leading-6">
                {qi + 1}. {question.question}
              </legend>
              {question.options.map((option, oi) => {
                const chosen = answers[qi] === oi;
                const showState = revealed && (chosen || option.is_correct);
                return (
                  <label
                    key={oi}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
                      showState && option.is_correct
                        ? "border-emerald-500 bg-emerald-100"
                        : showState && chosen
                          ? "border-red-500 bg-red-100"
                          : chosen
                            ? "border-foreground bg-[#eceae4]"
                            : "border-line bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${qi}`}
                      className="mt-1"
                      checked={chosen}
                      disabled={revealed}
                      onChange={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                    />
                    <span className="flex flex-col gap-1">
                      <span>{option.text}</span>
                      {showState ? (
                        <span className="text-muted">
                          {option.is_correct ? "Correct. " : "Not quite. "}
                          {option.explanation}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {revealed ? (
              <p className="text-xs text-muted">
                Assesses: {question.assessed_concepts.join(", ")} · Lessons:{" "}
                {question.related_lesson_titles.join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        {!revealed ? (
          <Button type="button" disabled={!answered} onClick={() => setRevealed(true)}>
            Check my answers
          </Button>
        ) : (
          <>
            <p className="text-sm leading-6" role="status">
              <span className="text-base font-semibold">
                {correct} of {check.questions.length} correct.
              </span>{" "}
              This check is formative; revisit the lessons and try again whenever you
              like.
            </p>
            <Button type="button" className="gap-2" onClick={reset}>
              <RetryIcon />
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
