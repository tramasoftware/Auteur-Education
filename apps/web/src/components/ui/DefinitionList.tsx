import type { ReactNode } from "react";

type Item = { term: string; detail: ReactNode };

export function DefinitionList({ items }: { items: Item[] }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-[minmax(10rem,auto)_1fr]">
      {items.map((item) => (
        <div key={item.term} className="contents">
          <dt className="font-medium text-zinc-700 dark:text-zinc-300">
            {item.term}
          </dt>
          <dd className="leading-6 text-zinc-900 dark:text-zinc-100">
            {item.detail}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-zinc-500">None</span>;
  }
  return (
    <ul className="list-disc pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
