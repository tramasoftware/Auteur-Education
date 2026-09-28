"use client";

import { useEffect, useId, useRef, useState } from "react";

import { inputClass } from "./Field";

type SelectProps<T extends string> = {
  id: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
};

/** Closed control matches the text inputs. The list is ours so the option hover is not the browser blue. */
export function Select<T extends string>({ id, value, options, onChange }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`${inputClass} flex items-center justify-between text-left`}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span>
        <span aria-hidden className="text-muted">
          ▾
        </span>
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-sm"
        >
          {options.map((option) => {
            const selected = option === value;
            return (
              <li key={option} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`w-full px-4 py-2.5 text-left text-base text-foreground hover:bg-[#eceae4] ${
                    selected ? "bg-[#eceae4]" : ""
                  }`}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
