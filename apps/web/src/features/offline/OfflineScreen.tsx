"use client";

import { useEffect, useRef, useState } from "react";

import "@/features/landing/landing.css";

import "./offline.css";

/** Static file outside the auth proxy, used only to confirm the connection is back. */
const PROBE_URL = "/google-icon-logo.svg";

async function connectionIsBack(): Promise<boolean> {
  if (!navigator.onLine) {
    return false;
  }
  try {
    const response = await fetch(PROBE_URL, { method: "HEAD", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Covers the app when the browser reports a lost connection.
 * Auteur does not offer offline reading, so the only way forward is to reconnect.
 */
export function OfflineScreen() {
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function goOffline() {
      setStillOffline(false);
      setOffline(true);
    }
    if (!navigator.onLine) {
      goOffline();
    }
    window.addEventListener("offline", goOffline);
    return () => window.removeEventListener("offline", goOffline);
  }, []);

  useEffect(() => {
    if (!offline) {
      return;
    }
    const root = rootRef.current;
    const covered = Array.from(document.body.children).filter(
      (element) => element !== root,
    );
    covered.forEach((element) => element.setAttribute("inert", ""));
    buttonRef.current?.focus();
    return () => {
      covered.forEach((element) => element.removeAttribute("inert"));
    };
  }, [offline]);

  async function tryAgain() {
    setChecking(true);
    setStillOffline(false);
    if (await connectionIsBack()) {
      window.location.reload();
      return;
    }
    setChecking(false);
    setStillOffline(true);
  }

  if (!offline) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="landing offline-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-title"
      aria-describedby="offline-description"
    >
      <header className="topfix">
        <div className="top">
          <span className="marca" aria-label="Auteur Education">
            <span className="m1">Auteur</span>
            <span className="m2">Education</span>
          </span>
        </div>
      </header>
      <main className="offline-main">
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
            <path
              d="M6 17a24 24 0 0 1 32 0M11 23a16 16 0 0 1 22 0M16 29a8 8 0 0 1 12 0"
              strokeLinecap="round"
            />
            <circle cx="22" cy="34" r="1.6" fill="currentColor" />
            <path d="M8 8l28 28" strokeLinecap="round" />
          </svg>
          <h1 id="offline-title">You’re offline.</h1>
          <p id="offline-description" className="bajada">
            Auteur needs an internet connection. You can’t continue until it returns.
          </p>
          <div className="que">
            <p>Lessons and audio aren’t available without a connection.</p>
            <p>Check your Wi-Fi or mobile data, then try again.</p>
          </div>
          <div className="acciones">
            <button
              ref={buttonRef}
              type="button"
              className="btn"
              onClick={tryAgain}
              disabled={checking}
            >
              {checking ? "Checking…" : "Try again"}
              <span className="ar" aria-hidden="true" />
            </button>
            <p className="nota" role="status">
              {stillOffline ? "Still offline. Check your connection and try again." : ""}
            </p>
          </div>
        </article>
      </main>
    </div>
  );
}
