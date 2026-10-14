"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isAnonymousClaim } from "@/lib/auth/claims";
import { createClient } from "@/lib/supabase/browser";

export function AccountControls({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [permanent, setPermanent] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function refresh() {
      const { data } = await supabase.auth.getClaims();
      if (!active) {
        return;
      }
      const claims = data?.claims as Record<string, unknown> | undefined;
      setPermanent(Boolean(claims) && !isAnonymousClaim(claims));
    }

    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!permanent) {
    return null;
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    onNavigate?.();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="mt-6 px-2 py-2 text-left text-sm text-muted hover:text-foreground"
    >
      Sign out
    </button>
  );
}
