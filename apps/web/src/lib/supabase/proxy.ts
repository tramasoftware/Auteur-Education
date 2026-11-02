import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { accountSession } from "@/lib/auth/claims";

import { supabasePublicEnv } from "./env";

const MEMBER_PATHS = new Set(["/home", "/my-courses", "/profile"]);

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, key } = supabasePublicEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([header, value]) => {
          supabaseResponse.headers.set(header, value);
        });
        if (!supabaseResponse.headers.has("Cache-Control")) {
          supabaseResponse.headers.set("Cache-Control", "private, no-store");
        }
      },
    },
  });

  // Verifies the session and refreshes cookies. Do not trust getSession here.
  const { data, error } = await supabase.auth.getClaims();
  if (MEMBER_PATHS.has(request.nextUrl.pathname)) {
    const session = accountSession(
      error ? undefined : (data?.claims as Record<string, unknown> | undefined),
    );
    if (session.status !== "registered") {
      const redirectResponse = NextResponse.redirect(new URL("/", request.url));
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value);
      });
      return redirectResponse;
    }
  }
  return supabaseResponse;
}
