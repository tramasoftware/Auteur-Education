"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/onboarding", label: "Onboarding", icon: "book" },
  { href: "/proposals", label: "Proposals", icon: "paths" },
  { href: "/library", label: "Library", icon: "library" },
  { href: "/account", label: "Account", icon: "user" },
  { href: "/admin", label: "Admin", icon: "shield" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-line bg-surface px-4 py-6">
      <Link
        href="/"
        className="px-2 text-sm font-semibold uppercase leading-tight tracking-tight text-foreground"
      >
        Auteur
        <br />
        Education
      </Link>
      <nav className="mt-8 flex flex-col gap-1 text-sm">
        {navItems.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors ${
                current ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function NavIcon({ name }: { name: (typeof navItems)[number]["icon"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    "aria-hidden": true as const,
    className: "size-4 shrink-0",
  };
  const paths: Record<(typeof navItems)[number]["icon"], ReactNode> = {
    book: (
      <>
        <path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.5A2.5 2.5 0 0 0 6 17V4.5Z" />
        <path d="M6 17a2.5 2.5 0 0 1 2.5-2.5H18" />
      </>
    ),
    paths: (
      <>
        <circle cx="6" cy="7" r="1.5" />
        <circle cx="18" cy="12" r="1.5" />
        <circle cx="8" cy="17" r="1.5" />
        <path d="M7.5 7.8 16.5 11.2M16.6 13.2 9.4 16.2" />
      </>
    ),
    library: (
      <>
        <path d="M5 19V6.5M9 19V5M13 19V7.5M17 19V8.5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M6.5 18.5a5.5 5.5 0 0 1 11 0" />
      </>
    ),
    shield: <path d="M12 3.5 18.5 6v5.2c0 3.6-2.5 6.4-6.5 8.3-4-1.9-6.5-4.7-6.5-8.3V6L12 3.5Z" />,
  };
  return <svg {...common}>{paths[name]}</svg>;
}
