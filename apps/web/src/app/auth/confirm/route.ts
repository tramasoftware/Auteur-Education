import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { resolveSignIn } from "@/lib/auth/entry";
import { DEFAULT_MEMBER_PATH, safeInternalPath } from "@/lib/auth/redirect";
import { assignTextSizeCookie } from "@/lib/reading-preference";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);
const PASSWORD_STEP = new Set<EmailOtpType>(["recovery", "email_change"]);

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = otpType(request.nextUrl.searchParams.get("type"));
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(
    request.nextUrl.searchParams.get("next"),
    DEFAULT_MEMBER_PATH,
  );
  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return redirectAfterConfirm(request, supabase, type, next);
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectAfterConfirm(request, supabase, type, next);
    }
  }

  return NextResponse.redirect(new URL("/login?error=link", request.url));
}

function otpType(value: string | null): EmailOtpType | null {
  if (value && OTP_TYPES.has(value as EmailOtpType)) {
    return value as EmailOtpType;
  }
  return null;
}

async function redirectAfterConfirm(
  request: NextRequest,
  supabase: Awaited<ReturnType<typeof createClient>>,
  type: EmailOtpType | null,
  next: string,
) {
  const { data } = await supabase.auth.getSession();
  const resolved = await resolveSignIn(next, data.session?.access_token);
  const destination =
    type && PASSWORD_STEP.has(type)
      ? `/login?mode=password&next=${encodeURIComponent(next)}`
      : resolved.path;
  const response = NextResponse.redirect(new URL(destination, request.url));
  assignTextSizeCookie(response, resolved.textSize);
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  return response;
}
