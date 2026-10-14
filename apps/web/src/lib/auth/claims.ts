export function isAnonymousClaim(
  claims: Record<string, unknown> | undefined,
): boolean {
  const value = claims?.is_anonymous;
  return value === true || value === "true";
}

export type AccountSession =
  | { status: "guest" }
  | { status: "anonymous" }
  | { status: "registered"; email: string | null; method: string | null };

/** Display fields from a verified JWT. Identity still comes from the user id, not metadata. */
export function accountSession(
  claims: Record<string, unknown> | undefined,
): AccountSession {
  if (!claims?.sub) {
    return { status: "guest" };
  }
  if (isAnonymousClaim(claims)) {
    return { status: "anonymous" };
  }
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  return {
    status: "registered",
    email: email || null,
    method: signInMethod(claims),
  };
}

function signInMethod(claims: Record<string, unknown>): string | null {
  const metadata = claims.app_metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const provider = (metadata as { provider?: unknown }).provider;
  if (provider === "email") {
    return "Email";
  }
  if (provider === "google") {
    return "Google";
  }
  return null;
}
