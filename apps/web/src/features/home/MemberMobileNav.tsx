import Link from "next/link";

type MemberMobileNavProps = {
  current: "home" | "courses" | "profile";
};

/** Home and My courses, shown only below 920px. Desktop header links stay in place. */
export function MemberMobileNav({ current }: MemberMobileNavProps) {
  return (
    <nav className="ae-mobile-nav" aria-label="Main navigation">
      <Link href="/home" aria-current={current === "home" ? "page" : undefined}>
        <HomeIcon />
        <span>Home</span>
      </Link>
      <Link href="/my-courses" aria-current={current === "courses" ? "page" : undefined}>
        <CoursesIcon />
        <span>My courses</span>
      </Link>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoursesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        d="M3.5 7.5h6l1.5 1.5H20.5V19a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 19V7.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M3.5 10.5h17" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
