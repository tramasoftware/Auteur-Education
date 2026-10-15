"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Button,
  ConfirmDialog,
  DefinitionList,
  outlineButtonClass,
  primaryButtonClass,
} from "@/components/ui";
import { accountSession, type AccountSession } from "@/lib/auth/claims";
import { formatBirthDate, genderLabel } from "@/lib/auth/profile";
import { getAccountProfile, type AccountProfile } from "@/lib/api";
import { createClient } from "@/lib/supabase/browser";

const REGISTER_HREF = "/login?mode=register&next=%2Faccount";
const SIGN_IN_HREF = "/login?next=%2Faccount";

export function AccountScreen() {
  const router = useRouter();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  useEffect(() => {
    if (session?.status !== "registered") {
      return;
    }
    let active = true;
    void getAccountProfile()
      .then((next) => {
        if (active) {
          setProfile(next);
        }
      })
      .catch(() => {
        if (active) {
          setProfile(null);
        }
      });
    return () => {
      active = false;
    };
  }, [session]);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "global" });
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
    ...(profile?.first_name ? [{ term: "Name", detail: profile.first_name }] : []),
    ...(profile?.last_name ? [{ term: "Last name", detail: profile.last_name }] : []),
    ...(profile?.birth_date
      ? [{ term: "Date of birth", detail: formatBirthDate(profile.birth_date) }]
      : []),
    ...(profile?.gender ? [{ term: "Gender", detail: genderLabel(profile.gender) }] : []),
  ];

  const avatar = profile?.avatar_url?.startsWith("https://") ? profile.avatar_url : null;

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-xl text-lg leading-8 text-muted">
        The account signed in on this device.
      </p>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          referrerPolicy="no-referrer"
          className="size-16 rounded-full border border-line object-cover"
        />
      ) : null}
      <DefinitionList items={items} />
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => setConfirmOpen(true)}
      >
        Sign out
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        title="Sign out?"
        description="You will leave this account on this device. You can sign in again whenever you want."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        busy={signingOut}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void signOut()}
      />
    </div>
  );
}
