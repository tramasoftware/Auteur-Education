import type { NextRequest } from "next/server";

export const PRIVATE_NO_STORE = "private, no-store";

/**
 * Cookie-authenticated POSTs are only accepted from this site.
 * FastAPI calls use an Authorization header, so a foreign page cannot attach them.
 */
export function isSameOriginPost(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) {
    return fetchSite === "same-origin";
  }
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin;
}
