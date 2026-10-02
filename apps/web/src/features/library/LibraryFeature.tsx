"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  ArrowRightIcon,
  ErrorNotice,
  inputClass,
  primaryButtonClass,
  StatusBadge,
} from "@/components/ui";
import { courses } from "@/lib/api";
import { courseStateLabel } from "@/lib/labels";
import type { CourseState, LibraryCourse } from "@/types/generator";

function courseTone(state: CourseState): "neutral" | "active" | "success" | "danger" {
  switch (state) {
    case "complete":
      return "success";
    case "failed":
      return "danger";
    case "queued":
      return "neutral";
    default:
      return "active";
  }
}

function resumeLabel(state: CourseState): string {
  switch (state) {
    case "queued":
    case "researching":
    case "writing":
    case "reviewing":
      return "Follow the build";
    case "partially_available":
      return "Continue where a module is available";
    case "complete":
      return "Open the course";
    case "failed":
      return "See what was kept";
  }
}

function formatActivity(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function LibraryFeature() {
  const [items, setItems] = useState<LibraryCourse[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    courses
      .list()
      .then((body) => {
        if (!cancelled) {
          setItems(body.courses);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!items) {
      return [];
    }
    if (normalizedQuery === "") {
      return items;
    }
    return items.filter((course) =>
      course.title.toLowerCase().includes(normalizedQuery),
    );
  }, [items, normalizedQuery]);

  if (error) {
    return <ErrorNotice error={error} />;
  }

  if (items === null) {
    return <p className="text-sm text-muted">Loading your courses.</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted">
        No generated courses yet.{" "}
        <Link href="/onboarding" className="underline underline-offset-4">
          Create a course
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="library-course-search" className="sr-only">
        Search by course name
      </label>
      <div className="relative w-full">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="library-course-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search by course name..."
          className={`${inputClass} py-2 pl-10 text-sm`}
          autoComplete="off"
        />
      </div>
      {filteredItems.length === 0 ? (
        <p className="text-sm text-muted">No courses match that name.</p>
      ) : (
    <ol className="flex flex-col gap-3">
      {filteredItems.map((course) => (
        <li
          key={course.id}
          className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">{course.title}</h2>
              <p className="text-sm text-muted">{course.subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
              <StatusBadge
                label={courseStateLabel[course.state]}
                tone={courseTone(course.state)}
              />
              <p className="text-xs text-muted">
                Last activity {formatActivity(course.updated_at)}
              </p>
            </div>
          </div>
          <p className="text-sm leading-6">{course.objective_statement}</p>
          <Link
            href={`/courses/${course.id}`}
            className={`${primaryButtonClass} gap-2`}
          >
            {resumeLabel(course.state)}
            <ArrowRightIcon />
          </Link>
        </li>
      ))}
    </ol>
      )}
    </div>
  );
}
