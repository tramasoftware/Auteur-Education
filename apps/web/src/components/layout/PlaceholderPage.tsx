import type { ReactNode } from "react";

type PlaceholderPageProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function PlaceholderPage({
  title,
  description,
  children,
}: PlaceholderPageProps) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{description}</p>
      {children}
    </main>
  );
}
