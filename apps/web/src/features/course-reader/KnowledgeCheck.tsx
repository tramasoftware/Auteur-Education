"use client";

import { useState } from "react";

import { Button } from "@/components/ui";
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
                    className={`flex cursor-pointer gap-3 rounded-md border p-3 text-sm ${
                      showState && option.is_correct
                        ? "border-emerald-500"
                        : showState && chosen
                          ? "border-red-500"
                          : chosen
                            ? "border-zinc-950 dark:border-zinc-50"
                            : "border-zinc-200 dark:border-zinc-800"
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
                        <span className="text-zinc-600 dark:text-zinc-400">
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
              <p className="text-xs text-zinc-500">
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
            <p className="text-sm" role="status">
              {correct} of {check.questions.length} correct. This check is formative;
              revisit the lessons and try again whenever you like.
            </p>
            <Button type="button" variant="secondary" onClick={reset}>
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
