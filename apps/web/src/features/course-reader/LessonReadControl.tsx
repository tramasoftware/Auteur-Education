"use client";

import { useEffect, useState } from "react";

import { ApiError, courses } from "@/lib/api";
import type { CourseProgress } from "@/types/generator";

import { trackReadingWrite } from "./module-reading-cache";

/** Explicit read mark for one published lesson (BR-PRG-001). Opening the lesson does not set this. */
export function LessonReadControl({
  courseId,
  lessonId,
  progress,
  onChanged,
}: {
  courseId: string;
  lessonId: string;
  progress: CourseProgress | null;
  onChanged?: (progress: CourseProgress) => void;
}) {
  const [optimisticRead, setOptimisticRead] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setOptimisticRead(null);
    setMessage(null);
  }, [lessonId]);

  const row = progress?.lessons.find((lesson) => lesson.lesson_id === lessonId) ?? null;
  const read = optimisticRead ?? row?.read ?? false;

  async function toggle() {
    if (!progress || busy) {
      return;
    }
    const nextRead = !read;
    setBusy(true);
    setMessage(null);
    setOptimisticRead(nextRead);
    try {
      const next = await trackReadingWrite(
        courses.setLessonRead(courseId, lessonId, {
          read: nextRead,
          updated_at: row?.updated_at ?? null,
        }),
      );
      setOptimisticRead(null);
      onChanged?.(next);
    } catch (error) {
      setOptimisticRead(null);
      if (error instanceof ApiError && error.code === "stale_version") {
        try {
          onChanged?.(await courses.progress(courseId));
        } catch {
          onChanged?.(progress);
        }
        setMessage("This mark changed on another device. Review it and try again.");
      } else if (error instanceof ApiError) {
        setMessage(error.message);
      } else {
        setMessage("The mark could not be saved. Your last confirmed progress is unchanged.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ae-lesson-read">
      <button
        className={read ? "btn is-read" : "btn"}
        type="button"
        disabled={!progress}
        aria-pressed={read}
        onClick={toggle}
      >
        {read ? (
          <svg className="tick" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2.2 6.3 4.7 8.8 9.8 3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="square"
            />
          </svg>
        ) : null}
        {read ? "Marked as read" : "Mark as read"}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
