import type { ReactNode } from "react";

type PlaceholderPageProps = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function PlaceholderPage({
  title,
  description,
  children,
}: PlaceholderPageProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-6 py-16">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="text-muted">{description}</p>
      ) : null}
      {children}
    </main>
  );
}
