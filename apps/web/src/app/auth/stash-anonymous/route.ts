import { NextResponse } from "next/server";

import { isAnonymousClaim } from "@/lib/auth/claims";
import { ANON_TRANSFER_COOKIE } from "@/lib/auth/transfer";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isAnonymousClaim(data?.claims as Record<string, unknown> | undefined)) {
    return NextResponse.json({ stashed: false });
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return NextResponse.json({ stashed: false }, { status: 401 });
  }
  const response = NextResponse.json({ stashed: true });
  response.cookies.set(ANON_TRANSFER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  return response;
}
