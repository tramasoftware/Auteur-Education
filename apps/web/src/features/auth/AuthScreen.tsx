"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Button, Field, Notice, inputClass } from "@/components/ui";
import { isAnonymousClaim } from "@/lib/auth/claims";
import { GENDERS, birthDateLimits, registrationProfile } from "@/lib/auth/profile";
import { safeInternalPath } from "@/lib/auth/redirect";
import { claimAnonymousSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/browser";

type Mode = "sign-in" | "register" | "forgot" | "password";

const titles: Record<Mode, string> = {
  "sign-in": "Sign in",
  register: "Create an account",
  forgot: "Reset your password",
  password: "Choose a password",
};

export function AuthScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = modeFrom(params.get("mode"));
  const next = safeInternalPath(params.get("next"), "/library");
  const linkError = params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const birthLimits = useMemo(() => birthDateLimits(), []);
  const [gender, setGender] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const askPassword = mode === "password" || mode === "sign-in" || (mode === "register" && !anonymous);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getClaims().then(({ data }) => {
      setAnonymous(isAnonymousClaim(data?.claims as Record<string, unknown> | undefined));
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "forgot") {
        await sendReset(email, next);
        setMessage(
          "If this email can receive a reset link, we sent one. It expires on its own.",
        );
        return;
      }
      if (mode === "password") {
        await setNewPassword(password);
        router.push(next);
        router.refresh();
        return;
      }
      if (mode === "register") {
        const pending = await registerAccount(
          email,
          password,
          next,
          anonymous,
          registrationProfile({ firstName, lastName, birthDate, gender }),
        );
        if (pending === "confirm") {
          setMessage("Check your email to confirm this address, then choose a password.");
          return;
        }
        if (pending === "check") {
          setMessage("Check your email to finish creating your account.");
          return;
        }
        router.push(next);
        router.refresh();
        return;
      }
      await signIn(email, password);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in is required to continue.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await continueWithGoogle(next);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Google sign-in is not available yet. Use email.",
      );
      setBusy(false);
    }
  }

  async function retryClaim() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/auth/claim-transfer", { method: "POST" });
      if (!response.ok) {
        throw new Error(
          "We could not keep your learning request with this account. Try again.",
        );
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">
          Auteur Education
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {titles[mode]}
        </h1>
        <p className="text-lg leading-8 text-muted">
          {process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true"
            ? "Google or email. Your learning request stays with you."
            : "Use your email. Your learning request stays with you."}
        </p>
      </div>

      {linkError === "link" ? (
        <Notice tone="error" title="That link is no longer valid">
          Request a new confirmation or reset message.
        </Notice>
      ) : null}
      {linkError === "claim" ? (
        <Notice tone="error" title="Your account is signed in">
          <p>The learning request was not attached yet.</p>
          <Button type="button" className="mt-3" busy={busy} onClick={retryClaim}>
            Try again
          </Button>
        </Notice>
      ) : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {error ? (
        <Notice tone="error" title="Something went wrong">
          {error}
        </Notice>
      ) : null}

      {mode !== "password" && process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          busy={busy}
          onClick={onGoogle}
        >
          Continue with Google
          <img
            src="/google-icon-logo.svg"
            alt=""
            width={18}
            height={18}
            className="size-[18px] shrink-0"
          />
        </Button>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {mode !== "password" ? (
          <Field id="email" label="Email">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </Field>
        ) : null}
        {askPassword ? (
          <Field id="password" label="Password" hint="At least 8 characters.">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
          </Field>
        ) : null}
        {mode === "register" ? (
          <>
            <Field id="first-name" label="Name">
              <input
                id="first-name"
                name="given-name"
                type="text"
                autoComplete="given-name"
                required
                maxLength={80}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="last-name" label="Last name">
              <input
                id="last-name"
                name="family-name"
                type="text"
                autoComplete="family-name"
                required
                maxLength={80}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id="birth-date" label="Date of birth" hint="Choose a date. 13 or older.">
              <input
                id="birth-date"
                name="bday"
                type="date"
                autoComplete="bday"
                required
                min={birthLimits.min}
                max={birthLimits.max}
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                className={`${inputClass} scheme-light`}
              />
            </Field>
            <Field id="gender" label="Gender">
              <select
                id="gender"
                name="gender"
                required
                value={gender}
                onChange={(event) => setGender(event.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Select
                </option>
                {GENDERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        <Button type="submit" className="w-full" busy={busy}>
          {mode === "register"
            ? "Create account"
            : mode === "forgot"
              ? "Send reset link"
              : mode === "password"
                ? "Save password"
                : "Sign in"}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        {mode === "sign-in" ? (
          <>
            <Link href={withNext("/login?mode=register", next)} className="text-foreground">
              Create an account
            </Link>
            <Link href={withNext("/login?mode=forgot", next)} className="text-muted">
              Forgot password
            </Link>
          </>
        ) : (
          <Link href={withNext("/login", next)} className="text-foreground">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

function modeFrom(value: string | null): Mode {
  if (value === "register" || value === "forgot" || value === "password") {
    return value;
  }
  return "sign-in";
}

function withNext(href: string, next: string): string {
  const url = new URL(href, "http://localhost");
  url.searchParams.set("next", next);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

async function registerAccount(
  email: string,
  password: string,
  next: string,
  anonymous: boolean,
  profile: ReturnType<typeof registrationProfile>,
): Promise<"confirm" | "check" | "session"> {
  const supabase = createClient();
  const origin = window.location.origin;
  const data = {
    first_name: profile.first_name,
    last_name: profile.last_name,
    birth_date: profile.birth_date,
    gender: profile.gender,
  };
  if (anonymous) {
    const { error } = await supabase.auth.updateUser({ email, data });
    if (error && !accountAlreadyExists(error)) {
      throw new Error("Check the email address and try again.");
    }
    return "confirm";
  }
  const { data: signedUp, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      data,
    },
  });
  if (error && !accountAlreadyExists(error)) {
    throw new Error("Check the email address and try again.");
  }
  if (error) {
    return "check";
  }
  return signedUp.session ? "session" : "check";
}

function accountAlreadyExists(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  if (code === "user_already_exists" || code === "email_exists") {
    return true;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists")
  );
}

async function signIn(email: string, password: string): Promise<void> {
  const supabase = createClient();
  const before = await supabase.auth.getSession();
  const anonymousToken = before.data.session?.user.is_anonymous
    ? before.data.session.access_token
    : null;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error("The email or password is incorrect.");
  }
  if (anonymousToken) {
    await claimAnonymousSession(anonymousToken);
  }
}

async function sendReset(email: string, next: string): Promise<void> {
  try {
    const supabase = createClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch {
    // The screen always says a link was sent when the address can receive one.
  }
}

async function setNewPassword(password: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  if (!claims?.sub || isAnonymousClaim(claims)) {
    throw new Error("The password could not be saved. Request a new link.");
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    throw new Error("The password could not be saved. Request a new link.");
  }
}

async function continueWithGoogle(next: string): Promise<void> {
  const supabase = createClient();
  const origin = window.location.origin;
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data: claims } = await supabase.auth.getClaims();
  if (isAnonymousClaim(claims?.claims as Record<string, unknown> | undefined)) {
    await fetch("/auth/stash-anonymous", { method: "POST" });
    const linked = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo },
    });
    if (!linked.error) {
      return;
    }
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) {
    throw new Error("Google sign-in is not available yet. Use email.");
  }
}
