"use client";

import { useEffect } from "react";

import { accountSession } from "@/lib/auth/claims";
import { createClient } from "@/lib/supabase/browser";

function leaveForLanding() {
  window.location.replace("/");
}

function signedOut(error: { message?: string } | null): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return !message.includes("fetch") && !message.includes("network");
}

/** Leaves member pages when the verified session is no longer a registered account. */
export function RegisteredSessionWatch() {
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function check() {
      const { data, error } = await supabase.auth.getClaims();
      if (cancelled) {
        return;
      }
      const claims = data?.claims as Record<string, unknown> | undefined;
      if (accountSession(claims).status === "registered") {
        return;
      }
      if (!error || signedOut(error)) {
        leaveForLanding();
      }
    }

    void check();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        window.setTimeout(() => {
          void check();
        }, 0);
      }
    });

    function onVisible() {
      if (document.visibilityState === "visible") {
        void check();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
