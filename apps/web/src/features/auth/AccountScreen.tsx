"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, DefinitionList, outlineButtonClass, primaryButtonClass } from "@/components/ui";
import { accountSession, type AccountSession } from "@/lib/auth/claims";
import { createClient } from "@/lib/supabase/browser";

const REGISTER_HREF = "/login?mode=register&next=%2Faccount";
const SIGN_IN_HREF = "/login?next=%2Faccount";

export function AccountScreen() {
  const router = useRouter();
  const [session, setSession] = useState<AccountSession | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function refresh() {
      const { data } = await supabase.auth.getClaims();
      if (!active) {
        return;
      }
      const claims = data?.claims as Record<string, unknown> | undefined;
      setSession(accountSession(claims));
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

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!session) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  if (session.status !== "registered") {
    return (
      <div className="flex flex-col gap-6">
        <p className="max-w-xl text-lg leading-8 text-muted">
          You are browsing without an account. Create one to keep your learning
          request with you.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={REGISTER_HREF} className={primaryButtonClass}>
            Create an account
          </Link>
          <Link href={SIGN_IN_HREF} className={outlineButtonClass}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const items = [
    { term: "Email", detail: session.email ?? "Not on this account yet" },
    ...(session.method ? [{ term: "Signed in with", detail: session.method }] : []),
  ];

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-xl text-lg leading-8 text-muted">
        The account signed in on this device.
      </p>
      <DefinitionList items={items} />
      <Button type="button" variant="outline" className="w-fit" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}
