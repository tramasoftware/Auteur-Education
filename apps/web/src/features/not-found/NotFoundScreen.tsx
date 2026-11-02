import Link from "next/link";

import { LandingFooter } from "@/features/landing/LandingFooter";
import "@/features/landing/landing.css";

import "./not-found.css";

export function NotFoundScreen() {
  return (
    <div className="landing not-found">
      <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500&display=swap"
      />
      <header className="topfix">
        <div className="top">
          <Link className="marca" href="/" aria-label="Auteur Education">
            <span className="m1">Auteur</span>
            <span className="m2">Education</span>
          </Link>
        </div>
      </header>
      <main className="not-found-main">
        <article className="nota-err">
          <span className="lomo" aria-hidden="true" />
          <svg
            className="ico-e"
            viewBox="0 0 44 44"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <path d="M13 8h12l8 8v20H13V8z" strokeLinejoin="round" />
            <path d="M25 8v8h8" strokeLinejoin="round" />
            <path d="M10 34L34 10" strokeLinecap="round" />
          </svg>
          <h1>This page isn’t here.</h1>
          <p className="bajada">The address may be mistyped, or the page may have moved.</p>
          <div className="que">
            <p>Check the address and try again.</p>
            <p>The rest of Auteur is still where you left it.</p>
          </div>
          <div className="acciones">
            <Link className="btn" href="/">
              Home
              <span className="ar" aria-hidden="true" />
            </Link>
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
