import Link from "next/link";

const navItems = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/proposals", label: "Proposals" },
  { href: "/library", label: "Library" },
  { href: "/account", label: "Account" },
  { href: "/admin", label: "Admin" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Auteur Education
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-zinc-950 dark:hover:text-zinc-50"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
