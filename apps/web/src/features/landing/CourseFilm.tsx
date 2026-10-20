"use client";

import { useEffect, useRef } from "react";

import { courseFilmMarkup } from "./courseFilmMarkup";
import { mountCourseFilm } from "./mountCourseFilm";

export function CourseFilm() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return mountCourseFilm(root);
  }, []);

  return (
    <figure ref={rootRef} className="ae-course-film" aria-labelledby="ae-film-title">
      <figcaption className="ae-film-sr" id="ae-film-title">
        From a question to a course of your own.
      </figcaption>
      <p className="ae-film-sr">
        A question is typed, refined into a clear direction, and explored through books, research
        and images. The sources gather inside a folder that closes to reveal your course.
      </p>
      <div dangerouslySetInnerHTML={{ __html: courseFilmMarkup }} />
    </figure>
  );
}
