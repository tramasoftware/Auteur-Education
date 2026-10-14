import { createClient } from "@/lib/supabase/browser";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let pendingToken: Promise<string | null> | null = null;

/** Access token for FastAPI. The API verifies it; this does not authorize by itself. */
export function ensureAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (!pendingToken) {
    pendingToken = loadAccessToken().finally(() => {
      pendingToken = null;
    });
  }
  return pendingToken;
}

async function loadAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const existing = await supabase.auth.getSession();
  if (existing.data.session?.access_token) {
    return existing.data.session.access_token;
  }
  const created = await supabase.auth.signInAnonymously();
  return created.data.session?.access_token ?? null;
}

export async function claimAnonymousSession(anonymousToken: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const permanent = data.session?.access_token;
  if (!permanent) {
    throw new Error("Sign in is required to continue.");
  }
  const response = await fetch(`${API_URL}/api/v1/auth/claim`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${permanent}`,
      "X-Anonymous-Authorization": `Bearer ${anonymousToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      "We could not keep your learning request with this account. Try again.",
    );
  }
}
