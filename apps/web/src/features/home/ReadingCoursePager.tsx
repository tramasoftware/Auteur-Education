"use client";

type ReadingCoursePagerProps = {
  page: number;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
};

export function ReadingCoursePager({
  page,
  pageCount,
  onPrevious,
  onNext,
  className,
}: ReadingCoursePagerProps) {
  if (pageCount <= 1) {
    return null;
  }
  const rootClass = ["ae-course-pager", className].filter(Boolean).join(" ");
  return (
    <nav className={rootClass} aria-label="Courses in progress">
      <button className="ae-course-pager-btn" disabled={page <= 0} type="button" onClick={onPrevious}>
        <span className="ar izq" aria-hidden="true" />
        previous
      </button>
      <span className="ae-course-pager-count" aria-live="polite">
        page {page + 1} of {pageCount}
      </span>
      <button
        className="ae-course-pager-btn"
        disabled={page >= pageCount - 1}
        type="button"
        onClick={onNext}
      >
        next
        <span className="ar" aria-hidden="true" />
      </button>
    </nav>
  );
}
