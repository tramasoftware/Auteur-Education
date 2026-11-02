import Link from "next/link";
import type { ReactNode } from "react";

import { getLandingAccountSummary } from "@/lib/auth/landing-account";

import { LandingFooter } from "./LandingFooter";
import { LandingHeaderAccount } from "./LandingHeaderAccount";
import "./landing.css";

type EditorialPage = "about" | "plans";

export async function EditorialFrame({
  current,
  children,
}: {
  current?: EditorialPage;
  children: ReactNode;
}) {
  const account = await getLandingAccountSummary();

  return (
    <div className="landing">
      <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500&display=swap"
      />
      <header className="topfix">
        <div className="top">
          <nav className="ae-header-links" aria-label="Main navigation">
            <Link
              className="ae-nav-link"
              href="/about"
              aria-current={current === "about" ? "page" : undefined}
            >
              About
            </Link>
            <Link
              className="ae-nav-link"
              href="/plans"
              aria-current={current === "plans" ? "page" : undefined}
            >
              Plans
            </Link>
          </nav>
          <Link className="marca" href="/" aria-label="Auteur Education">
            <span className="m1">Auteur</span>
            <span className="m2">Education</span>
          </Link>
          <LandingHeaderAccount account={account} />
        </div>
      </header>
      {children}
      <LandingFooter />
    </div>
  );
}
