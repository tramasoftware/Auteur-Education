import Link from "next/link";

import { getHealth } from "@/lib/api";

export default async function Home() {
  let apiStatus = "unreachable";

  try {
    const health = await getHealth();
    apiStatus = health.status;
  } catch {
    apiStatus = "unreachable";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          Auteur Education
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Structured theoretical learning, in text and audio.
        </h1>
        <p className="max-w-xl text-lg leading-8 text-muted">
          Turn an intention to understand something into a researched course
          with a clear path, sources, and a personal library.
        </p>
        <Link
          href="/onboarding"
          className="inline-flex w-fit items-center rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-surface cursor-pointer hover:bg-foreground/85"
        >
          Start a learning request
        </Link>
      </div>
    </main>
  );
}
