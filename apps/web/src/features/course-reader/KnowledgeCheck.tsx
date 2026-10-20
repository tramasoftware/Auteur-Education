"use client";

import { useState } from "react";

import { Button, RetryIcon } from "@/components/ui";
import type { KnowledgeCheck as KnowledgeCheckData } from "@/types/generator";

/**
 * UF-07: formative, optional, repeatable, non-certifying. Answers are checked
 * locally; nothing is recorded (student progress is out of demo scope).
 */
export function KnowledgeCheck({
  check,
  sheet = false,
}: {
  check: KnowledgeCheckData;
  sheet?: boolean;
}) {
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
    <div className={sheet ? "kc" : "flex flex-col gap-6"}>
      <ol className={sheet ? undefined : "flex flex-col gap-6"}>
        {check.questions.map((question, qi) => (
          <li key={qi} className={sheet ? undefined : "flex flex-col gap-3"}>
            <fieldset className={sheet ? undefined : "flex flex-col gap-2"}>
              <legend className={sheet ? undefined : "text-sm font-medium leading-6"}>
                {qi + 1}. {question.question}
              </legend>
              {question.options.map((option, oi) => {
                const chosen = answers[qi] === oi;
                const showState = revealed && (chosen || option.is_correct);
                const sheetState = showState
                  ? option.is_correct
                    ? " ok"
                    : chosen
                      ? " bad"
                      : ""
                  : chosen
                    ? " pick"
                    : "";
                return (
                  <label
                    key={oi}
                    className={
                      sheet
                        ? `opt${sheetState}`
                        : `flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
                            showState && option.is_correct
                              ? "border-emerald-500 bg-emerald-100"
                              : showState && chosen
                                ? "border-red-500 bg-red-100"
                                : chosen
                                  ? "border-foreground bg-[#eceae4]"
                                  : "border-line bg-surface"
                          }`
                    }
                  >
                    <input
                      type="radio"
                      name={`question-${qi}`}
                      className={sheet ? undefined : "mt-1"}
                      checked={chosen}
                      disabled={revealed}
                      onChange={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                    />
                    <span className={sheet ? "opt-copy" : "flex flex-col gap-1"}>
                      <span>{option.text}</span>
                      {showState ? (
                        <span className={sheet ? "why" : "text-muted"}>
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
              <p className={sheet ? "meta-q" : "text-xs text-muted"}>
                Assesses: {question.assessed_concepts.join(", ")} · Lessons:{" "}
                {question.related_lesson_titles.join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <div className={sheet ? "kc-actions" : "flex flex-wrap items-center gap-3"}>
        {!revealed ? (
          sheet ? (
            <button className="btn" type="button" disabled={!answered} onClick={() => setRevealed(true)}>
              Check my answers
            </button>
          ) : (
            <Button type="button" disabled={!answered} onClick={() => setRevealed(true)}>
              Check my answers
            </Button>
          )
        ) : (
          <>
            <p className={sheet ? undefined : "text-sm leading-6"} role="status">
              <span className={sheet ? undefined : "text-base font-semibold"}>
                {correct} of {check.questions.length} correct.
              </span>{" "}
              This check is formative; revisit the lessons and try again whenever you
              like.
            </p>
            {sheet ? (
              <button className="btn ghost" type="button" onClick={reset}>
                Try again
              </button>
            ) : (
              <Button type="button" className="gap-2" onClick={reset}>
                <RetryIcon />
                Try again
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
