import { NextResponse, type NextRequest } from "next/server";

import { isSameOriginPost, PRIVATE_NO_STORE } from "@/lib/auth/csrf";
import { ANON_TRANSFER_COOKIE, claimWithTokens } from "@/lib/auth/transfer";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json(
      { attached: false },
      { status: 403, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
  const anonymous = request.cookies.get(ANON_TRANSFER_COOKIE)?.value;
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const permanent = data.session?.access_token;
  if (!anonymous || !permanent) {
    return NextResponse.json(
      { attached: false },
      { status: 401, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
  const attached = await claimWithTokens(anonymous, permanent);
  if (!attached) {
    return NextResponse.json(
      { attached: false },
      { status: 401, headers: { "Cache-Control": PRIVATE_NO_STORE } },
    );
  }
  const response = NextResponse.json(
    { attached: true },
    { headers: { "Cache-Control": PRIVATE_NO_STORE } },
  );
  response.cookies.set(ANON_TRANSFER_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
