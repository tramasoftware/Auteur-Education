"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ExitDoorIcon } from "@/components/icons/ExitDoorIcon";
import { LogoutDialog } from "@/features/auth/LogoutDialog";
import { Portrait } from "@/features/home/Portrait";
import type { LandingAccountSummary } from "@/lib/auth/landing-account";
import { clearMemberDisplay } from "@/lib/member-display";
import { clearReadingPreference } from "@/lib/reading-preference";
import { createClient } from "@/lib/supabase/browser";

export function LandingHeaderAccount({
  account,
}: {
  account: LandingAccountSummary | null;
}) {
  if (!account) {
    return (
      <Link className="ae-header-account" href="/login">
        Log in
      </Link>
    );
  }

  return <LandingMemberAccount account={account} />;
}

function LandingMemberAccount({ account }: { account: LandingAccountSummary }) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

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
  }, [menuOpen, loggingOut]);

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
