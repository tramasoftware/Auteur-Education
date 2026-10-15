import { NextResponse, type NextRequest } from "next/server";

import { isAnonymousClaim } from "@/lib/auth/claims";
import { isSameOriginPost, PRIVATE_NO_STORE } from "@/lib/auth/csrf";
import { ANON_TRANSFER_COOKIE } from "@/lib/auth/transfer";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json(
      { stashed: false },
      { status: 403, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isAnonymousClaim(data?.claims as Record<string, unknown> | undefined)) {
    return NextResponse.json(
      { stashed: false },
      { headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return NextResponse.json(
      { stashed: false },
      { status: 401, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
  const response = NextResponse.json({ stashed: true });
  response.cookies.set(ANON_TRANSFER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  response.headers.set("Cache-Control", PRIVATE_NO_STORE);
  return response;
}
