/**
 * Local defaults stay for the dev machine. On the deployed demo, the browser
 * calls /api/v1 on the same host. Server Components use the internal API
 * binding so they are not blocked by Vercel Deployment Protection.
 */

function stripSlash(value: string): string {
  return value.replace(/\/$/, "");
}

export function isLocalHost(host: string): boolean {
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function publicOrigin(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (isLocalHost(url.host)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function deploymentOrigin(): string | null {
  const raw = process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!raw) {
    return null;
  }
  return publicOrigin(raw.startsWith("http") ? raw : `https://${raw}`);
}

/** Injected by Vercel service bindings. Do not set this in the dashboard. */
function internalApiOrigin(): string | null {
  const raw = process.env.AUTEUR_API_INTERNAL_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    return stripSlash(raw);
  }
}

type RequestLike = {
  headers: { get(name: string): string | null };
  nextUrl: { origin: string; host: string };
};

/** Browser-facing origin. Ignores an internal localhost host behind the Vercel proxy. */
export function requestOrigin(request: RequestLike): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost && !isLocalHost(forwardedHost)) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }
  if (!isLocalHost(request.nextUrl.host)) {
    return request.nextUrl.origin;
  }
  return publicOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? deploymentOrigin() ?? request.nextUrl.origin;
}

export function redirectTo(request: RequestLike, path: string): URL {
  return new URL(path, requestOrigin(request));
}

/**
 * Absolute or same-origin URL for an API path.
 * A localhost NEXT_PUBLIC_API_URL is kept only while the page itself is local.
 */
export function apiUrl(path: string, host?: string | null): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const configuredPublic = publicOrigin(configured);
  const pageHost = host ?? (typeof window !== "undefined" ? window.location.host : null);

  if (pageHost && isLocalHost(pageHost)) {
    return `${stripSlash(configured || "http://localhost:8000")}${suffix}`;
  }
  if (typeof window !== "undefined") {
    return configuredPublic ? `${configuredPublic}${suffix}` : suffix;
  }
  const internal = internalApiOrigin();
  if (internal) {
    return `${internal}${suffix}`;
  }
  if (configuredPublic) {
    return `${configuredPublic}${suffix}`;
  }
  if (pageHost) {
    return `https://${pageHost}${suffix}`;
  }
  return `${deploymentOrigin() ?? publicOrigin(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:8000"}${suffix}`;
}
