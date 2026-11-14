import { clearCachedUserId, onMemberSessionClear } from "@/lib/member-display";
import { apiUrl } from "@/lib/public-url";
import { createClient } from "@/lib/supabase/browser";

const REFRESH_MARGIN_MS = 60_000;

let pendingToken: Promise<string | null> | null = null;
let tokenEpoch = 0;
let cachedToken: { value: string; refreshAt: number } | null = null;

function clearAccessToken(): void {
  tokenEpoch += 1;
  cachedToken = null;
  pendingToken = null;
}

onMemberSessionClear(clearAccessToken);

if (typeof window !== "undefined") {
  createClient().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") {
      clearCachedUserId();
    } else if (event === "SIGNED_OUT") {
      clearAccessToken();
    }
  });
}

/** Access token for FastAPI. The API verifies it; this does not authorize by itself. */
export function ensureAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (cachedToken && cachedToken.refreshAt > Date.now()) {
    return Promise.resolve(cachedToken.value);
  }
  if (!pendingToken) {
    pendingToken = loadAccessToken().finally(() => {
      pendingToken = null;
    });
  }
  return pendingToken;
}

function tokenExpiryMs(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !("exp" in parsed)) {
      return null;
    }
    const exp = (parsed as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function rememberToken(token: string | null, epoch: number): string | null {
  if (epoch !== tokenEpoch) {
    return token;
  }
  if (!token) {
    cachedToken = null;
    return null;
  }
  const exp = tokenExpiryMs(token);
  const refreshAt = exp === null ? 0 : exp - REFRESH_MARGIN_MS;
  if (refreshAt <= Date.now()) {
    cachedToken = null;
    return token;
  }
  cachedToken = { value: token, refreshAt };
  return token;
}

async function loadAccessToken(): Promise<string | null> {
  const epoch = tokenEpoch;
  const supabase = createClient();
  const existing = await supabase.auth.getSession();
  if (existing.data.session?.access_token) {
    return rememberToken(existing.data.session.access_token, epoch);
  }
  const created = await supabase.auth.signInAnonymously();
  return rememberToken(created.data.session?.access_token ?? null, epoch);
}

export async function claimAnonymousSession(anonymousToken: string): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const permanent = data.session?.access_token;
  if (!permanent) {
    throw new Error("Sign in is required to continue.");
  }
  const response = await fetch(apiUrl("/api/v1/auth/claim"), {
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
