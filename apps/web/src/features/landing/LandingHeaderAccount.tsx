"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { ExitDoorIcon } from "@/components/icons/ExitDoorIcon";
import { LogoutDialog } from "@/features/auth/LogoutDialog";
import { Portrait } from "@/features/home/Portrait";
import type { LandingAccountSummary } from "@/lib/auth/landing-account";
import { clearMemberDisplay } from "@/lib/member-display";
import { clearReadingPreference } from "@/lib/reading-preference";
import { createClient } from "@/lib/supabase/browser";

type EditorialPage = "about" | "plans";

export function LandingHeaderAccount({
  account,
  current,
}: {
  account: LandingAccountSummary | null;
  current?: EditorialPage;
}) {
  return (
    <>
      <div className="ae-header-account-desktop">
        {account ? (
          <LandingMemberAccountDesktop account={account} />
        ) : (
          <Link className="ae-header-account" href="/login">
            Log in
          </Link>
        )}
      </div>
      <LandingHeaderMobileMenu account={account} current={current} />
    </>
  );
}

function LandingMemberAccountDesktop({ account }: { account: LandingAccountSummary }) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useHeaderMenuDismiss(rootRef, menuOpen, loggingOut, setMenuOpen);

  async function confirmLogout() {
    setLoggingOut(true);
    setLogoutError("");
    const { error } = await createClient().auth.signOut();
    if (error) {
      setLogoutError("Could not log out. Try again.");
      setLoggingOut(false);
      return;
    }
    clearReadingPreference();
    clearMemberDisplay();
    window.location.replace("/");
  }

  return (
    <>
      <div className="ae-header-account-menu" ref={rootRef}>
        <button
          type="button"
          className="ae-header-account ae-header-account--member"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          disabled={loggingOut}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span className="ae-header-account-name">{account.displayName}</span>
          <span className="ae-header-account-avatar" aria-hidden="true">
            <Portrait src={account.avatarUrl} />
          </span>
        </button>
        {menuOpen ? (
          <div className="ae-header-account-panel" id={menuId} role="menu">
            <button
              type="button"
              className="ae-header-account-logout"
              role="menuitem"
              disabled={loggingOut}
              onClick={() => {
                setLogoutError("");
                setMenuOpen(false);
                setLogoutOpen(true);
              }}
            >
              <ExitDoorIcon />
              Log out
            </button>
          </div>
        ) : null}
      </div>
      <LogoutDialog
        open={logoutOpen}
        busy={loggingOut}
        error={logoutError}
        onClose={() => {
          if (!loggingOut) {
            setLogoutOpen(false);
          }
        }}
        onConfirm={() => void confirmLogout()}
      />
    </>
  );
}

function LandingHeaderMobileMenu({
  account,
  current,
}: {
  account: LandingAccountSummary | null;
  current?: EditorialPage;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useHeaderMenuDismiss(rootRef, menuOpen, loggingOut, setMenuOpen);

  async function confirmLogout() {
    setLoggingOut(true);
    setLogoutError("");
    const { error } = await createClient().auth.signOut();
    if (error) {
      setLogoutError("Could not log out. Try again.");
      setLoggingOut(false);
      return;
    }
    clearReadingPreference();
    window.location.replace("/");
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <>
      <div className="ae-header-mobile-menu" ref={rootRef}>
        <button
          type="button"
          className="ae-header-menu-toggle"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          disabled={loggingOut}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <MenuIcon open={menuOpen} />
        </button>
        {menuOpen ? (
          <div className="ae-header-account-panel ae-header-mobile-panel" id={menuId} role="menu">
            <Link
              className="ae-header-menu-link"
              href="/about"
              role="menuitem"
              aria-current={current === "about" ? "page" : undefined}
              onClick={closeMenu}
            >
              About
            </Link>
            <Link
              className="ae-header-menu-link"
              href="/plans"
              role="menuitem"
              aria-current={current === "plans" ? "page" : undefined}
              onClick={closeMenu}
            >
              Plans
            </Link>
            {account ? (
              <button
                type="button"
                className="ae-header-account-logout ae-header-menu-logout"
                role="menuitem"
                disabled={loggingOut}
                onClick={() => {
                  setLogoutError("");
                  setMenuOpen(false);
                  setLogoutOpen(true);
                }}
              >
                <ExitDoorIcon />
                Log out
              </button>
            ) : (
              <Link
                className="ae-header-menu-link ae-header-menu-link--login"
                href="/login"
                role="menuitem"
                onClick={closeMenu}
              >
                Log in
              </Link>
            )}
          </div>
        ) : null}
      </div>
      {account ? (
        <LogoutDialog
          open={logoutOpen}
          busy={loggingOut}
          error={logoutError}
          onClose={() => {
            if (!loggingOut) {
              setLogoutOpen(false);
            }
          }}
          onConfirm={() => void confirmLogout()}
        />
      ) : null}
    </>
  );
}

function useHeaderMenuDismiss(
  rootRef: RefObject<HTMLDivElement | null>,
  menuOpen: boolean,
  loggingOut: boolean,
  setMenuOpen: (value: boolean | ((open: boolean) => boolean)) => void,
) {
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loggingOut) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [loggingOut, menuOpen, rootRef, setMenuOpen]);
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="ae-header-menu-icon"
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      aria-hidden="true"
    >
      {open ? (
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path d="M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 12h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M4 17h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
