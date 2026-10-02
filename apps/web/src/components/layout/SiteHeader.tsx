"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

import { BlueprintNavIcon } from "@/components/icons/BlueprintNavIcon";
import { resolveCreationNavTarget, type CreationNavTarget } from "@/lib/activeBuild";
import {
  isCourseFlowPath,
  rememberCourseFlowPath,
  resolvePlanningStage,
  type CourseFlowStage,
} from "@/lib/session";

const navItems = [
  { href: "/library", label: "Library", icon: "library" },
  { href: "/account", label: "Account", icon: "user" },
  { href: "/admin", label: "Admin", icon: "shield" },
] as const;

type NavIconName =
  | (typeof navItems)[number]["icon"]
  | "create"
  | "onboarding"
  | "proposals"
  | "blueprint"
  | "generating";

const PLANNING_NAV: Record<
  CourseFlowStage,
  { label: string; icon: NavIconName }
> = {
  create: { label: "Create a course", icon: "create" },
  onboarding: { label: "Onboarding", icon: "onboarding" },
  proposals: { label: "Select direction", icon: "proposals" },
  blueprint: { label: "Draft Blueprint", icon: "blueprint" },
};

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
        <Suspense
          fallback={
            <CourseCreationNavLinkPresentation
              href="/onboarding"
              label={PLANNING_NAV.create.label}
              icon={PLANNING_NAV.create.icon}
              current={false}
              generating={false}
            />
          }
        >
          <CourseCreationNavLink pathname={pathname} />
        </Suspense>
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

function CourseCreationNavLink({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [target, setTarget] = useState<CreationNavTarget | null>(null);
  const onPlanningFlow = isCourseFlowPath(pathname);

  useEffect(() => {
    let cancelled = false;
    resolveCreationNavTarget()
      .then((next) => {
        if (!cancelled) {
          setTarget(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTarget(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  useEffect(() => {
    if (!onPlanningFlow || target?.mode === "generating") {
      return;
    }
    const path = search ? `${pathname}?${search}` : pathname;
    rememberCourseFlowPath(path);
    setTarget((prev) =>
      prev?.mode === "planning"
        ? {
            ...prev,
            href: path,
            stage: resolvePlanningStage(pathname, search, prev.stage),
          }
        : prev,
    );
  }, [onPlanningFlow, pathname, search, target?.mode]);

  const href = target?.href ?? "/onboarding";

  const planningStage: CourseFlowStage =
    target?.mode === "planning"
      ? resolvePlanningStage(pathname, search, target.stage)
      : "create";

  const { label, icon } =
    target?.mode === "generating"
      ? { label: "Generating course", icon: "generating" as const }
      : PLANNING_NAV[planningStage];

  const onGeneratingCourse =
    target?.mode === "generating" &&
    (pathname === `/courses/${target.courseId}` ||
      pathname.startsWith(`/courses/${target.courseId}/`));
  const current = onGeneratingCourse || (onPlanningFlow && target?.mode === "planning");

  return (
    <CourseCreationNavLinkPresentation
      href={href}
      label={label}
      icon={icon}
      current={current}
      generating={target?.mode === "generating"}
    />
  );
}

function CourseCreationNavLinkPresentation({
  href,
  label,
  icon,
  current,
  generating,
}: {
  href: string;
  label: string;
  icon: NavIconName;
  current: boolean;
  generating: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors ${
        current ? "font-medium text-foreground" : "text-muted hover:text-foreground"
      } ${generating ? "text-foreground" : ""}`}
    >
      <NavIcon name={icon} />
      {label}
    </Link>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "blueprint") {
    return <BlueprintNavIcon />;
  }

  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    "aria-hidden": true as const,
    className: "size-5 shrink-0",
  };
  const paths: Record<Exclude<NavIconName, "blueprint">, ReactNode> = {
    create: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
    onboarding: (
      <>
        <path d="M8 6h8M8 10h8M8 14h5" strokeLinecap="round" />
        <path d="M6 4h12a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2-3-2V6a2 2 0 0 1 2-2Z" />
      </>
    ),
    proposals: (
      <>
        <path d="M12 19V13" strokeLinecap="round" />
        <path
          d="M12 13 6.5 6.5M6.5 6.5 8.75 7.15M6.5 6.5 7.15 8.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 13 17.5 6.5M17.5 6.5 15.25 7.15M17.5 6.5 16.85 8.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    generating: (
      <>
        <path
          d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
          strokeLinecap="round"
        />
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
  return <svg {...common}>{paths[name as Exclude<NavIconName, "blueprint">]}</svg>;
}
