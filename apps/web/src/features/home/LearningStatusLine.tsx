import type { ReactNode } from "react";

export function LearningStatusLine({
  count,
  variant,
}: {
  count: number;
  variant: "header" | "library";
}): ReactNode {
  if (variant === "library") {
    return (
      <>
        <b>{count}</b> in progress
      </>
    );
  }
  if (count === 0) {
    return <>No course in progress</>;
  }
  return (
    <>
      <b>{count}</b> {count === 1 ? "course" : "courses"} in progress
    </>
  );
}
