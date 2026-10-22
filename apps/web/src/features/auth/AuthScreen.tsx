"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { LandingFooter } from "@/features/landing/LandingFooter";
import { isAnonymousClaim } from "@/lib/auth/claims";
import { GENDERS, birthDateLimits, registrationProfile } from "@/lib/auth/profile";
import { safeInternalPath } from "@/lib/auth/redirect";
import { claimAnonymousSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/browser";

import "@/features/landing/landing.css";
import "./auth.css";

type Mode = "sign-in" | "register" | "forgot" | "password";

const copy: Record<Mode, { title: string; sub: string }> = {
  "sign-in": {
    title: "Welcome back",
    sub: "Use the email you signed up with.",
  },
  register: {
    title: "Create an account",
    sub: "Your learning request stays with you.",
  },
  forgot: {
    title: "Reset your password",
    sub: "We’ll send a link if this email can receive one.",
  },
  password: {
    title: "Choose a password",
    sub: "Use at least 8 characters.",
  },
};

export function AuthScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = modeFrom(params.get("mode"));
  const next = safeInternalPath(params.get("next"), "/home");
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
  const showGoogle =
    mode !== "password" &&
    mode !== "forgot" &&
    process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true";
  const screen = copy[mode];

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
    <div className="auth-screen">
      <header className="topfix">
        <div className="top">
          <Link className="back" href="/" aria-label="Back to Home">
            <span className="ar izq" aria-hidden="true" />
            <span className="txt">Home</span>
          </Link>
          <Link className="marca" href="/" aria-label="Auteur Education">
            <span className="m1">Auteur</span>
            <span className="m2">Education</span>
          </Link>
          <span />
        </div>
      </header>

      <div className="sesion">
        <h1>{screen.title}</h1>
        <p className="sub">{screen.sub}</p>
        <div className="bloque-t">
          {linkError === "link" ? (
            <p className="nota error" role="alert">
              <strong>That link is no longer valid</strong>
              Request a new confirmation or reset message.
            </p>
          ) : null}
          {linkError === "claim" ? (
            <div className="nota error" role="alert">
              <strong>Your account is signed in</strong>
              <p>The learning request was not attached yet.</p>
              <button type="button" className="btn" disabled={busy} onClick={retryClaim}>
                Try again
                <span className="ar" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {message ? (
            <p className="nota success" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="nota error" role="alert">
              <strong>Something went wrong</strong>
              {error}
            </p>
          ) : null}

          {showGoogle ? (
            <>
              <button type="button" className="google" disabled={busy} onClick={onGoogle}>
                Continue with Google
                <img src="/google-icon-logo.svg" alt="" width={18} height={18} />
              </button>
              <p className="sep">or</p>
            </>
          ) : null}

          <form onSubmit={onSubmit}>
            {mode !== "password" ? (
              <AuthField id="email" label="Email">
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </AuthField>
            ) : null}
            {askPassword ? (
              <AuthField
                id="password"
                label="Password"
                hint="At least 8 characters."
                aside={
                  mode === "sign-in" ? (
                    <Link href={withNext("/login?mode=forgot", next)}>Forgot password</Link>
                  ) : null
                }
              >
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </AuthField>
            ) : null}
            {mode === "register" ? (
              <>
                <div className="dos-c">
                  <AuthField id="first-name" label="Name">
                    <input
                      id="first-name"
                      name="given-name"
                      type="text"
                      autoComplete="given-name"
                      required
                      maxLength={80}
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                    />
                  </AuthField>
                  <AuthField id="last-name" label="Last name">
                    <input
                      id="last-name"
                      name="family-name"
                      type="text"
                      autoComplete="family-name"
                      required
                      maxLength={80}
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                    />
                  </AuthField>
                </div>
                <div className="dos-c">
                  <AuthField id="birth-date" label="Date of birth">
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
                    />
                  </AuthField>
                  <AuthField id="gender" label="Gender">
                    <select
                      id="gender"
                      name="gender"
                      required
                      value={gender}
                      onChange={(event) => setGender(event.target.value)}
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
                  </AuthField>
                </div>
              </>
            ) : null}
            <button type="submit" className="btn" disabled={busy}>
              {mode === "register"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset link"
                  : mode === "password"
                    ? "Save password"
                    : "Sign in"}
              <span className="ar" aria-hidden="true" />
            </button>
          </form>

          {mode === "sign-in" ? (
            <p className="pie-f">
              New here? <Link href={withNext("/login?mode=register", next)}>Create an account</Link>
            </p>
          ) : (
            <p className="pie-f">
              Already have an account? <Link href={withNext("/login", next)}>Sign in</Link>
            </p>
          )}
        </div>
      </div>
      <div className="landing">
        <LandingFooter />
      </div>
    </div>
  );
}

function AuthField({
  id,
  label,
  aside,
  hint,
  children,
}: {
  id: string;
  label: string;
  aside?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="f">
      <div className="f-row">
        <label htmlFor={id}>{label}</label>
        {aside ? <small>{aside}</small> : null}
      </div>
      <div className="in">{children}</div>
      {hint ? <p className="ayuda">{hint}</p> : null}
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
