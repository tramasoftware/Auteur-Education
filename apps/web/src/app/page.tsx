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
        <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Auteur Education
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Structured theoretical learning, in text and audio.
        </h1>
        <p className="max-w-xl text-lg leading-7 text-zinc-600 dark:text-zinc-400">
          Turn an intention to understand something into a researched course
          with a clear path, sources, and a personal library.
        </p>
      </div>
      <p className="text-sm text-zinc-500">
        API health:{" "}
        <span className="font-mono text-zinc-950 dark:text-zinc-50">
          {apiStatus}
        </span>
      </p>
    </main>
  );
}
