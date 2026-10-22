import Link from "next/link";
import type { ReactNode } from "react";

import { LandingFooter } from "@/features/landing/LandingFooter";
import "@/features/landing/landing.css";

import { Portrait } from "./Portrait";
import { RegisteredSessionWatch } from "./RegisteredSessionWatch";
import "./home.css";

type MemberPage = "home" | "courses" | "profile";

export function MemberFrame({
  current,
  status,
  children,
}: {
  current: MemberPage;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="landing member">
      <RegisteredSessionWatch />
      <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500&display=swap"
      />
      <header className="topfix">
        <div className="top">
          <nav className="ae-header-links" aria-label="Main navigation">
            <NavLink href="/home" current={current === "home"}>
              Home
            </NavLink>
            <NavLink href="/my-courses" current={current === "courses"}>
              My courses
            </NavLink>
          </nav>
          <Link className="marca" href="/home" aria-label="Auteur Education home">
            <span className="m1">Auteur</span>
            <span className="m2">Education</span>
          </Link>
          <p className="donde">
            <span>{status}</span>
            <Link className="avatar" href="/profile" aria-label="Your profile">
              <Portrait />
            </Link>
          </p>
        </div>
      </header>
      {children}
      <LandingFooter member />
    </div>
  );
}

function NavLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  if (current) {
    return (
      <span className="ae-nav-link" aria-current="page">
        {children}
      </span>
    );
  }
  return (
    <Link className="ae-nav-link" href={href}>
      {children}
    </Link>
  );
}
