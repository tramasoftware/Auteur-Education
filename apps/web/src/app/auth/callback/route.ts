import { NextResponse, type NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/auth/redirect";
import { ANON_TRANSFER_COOKIE, claimWithTokens } from "@/lib/auth/transfer";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?error=link", request.url));
    }
  }

  const anonymous = request.cookies.get(ANON_TRANSFER_COOKIE)?.value;
  const { data } = await supabase.auth.getSession();
  const permanent = data.session?.access_token;
  let claimFailed = false;
  if (anonymous && permanent) {
    claimFailed = !(await claimWithTokens(anonymous, permanent));
  }

  const destination = claimFailed
    ? `/login?error=claim&next=${encodeURIComponent(next)}`
    : next;
  const response = NextResponse.redirect(new URL(destination, request.url));
  if (!claimFailed) {
    response.cookies.set(ANON_TRANSFER_COOKIE, "", { path: "/", maxAge: 0 });
  }
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  return response;
}
