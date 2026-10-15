import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/auth/redirect";
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
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return redirectAfterConfirm(request, type, next);
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectAfterConfirm(request, type, next);
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

function redirectAfterConfirm(
  request: NextRequest,
  type: EmailOtpType | null,
  next: string,
) {
  const destination =
    type && PASSWORD_STEP.has(type)
      ? `/login?mode=password&next=${encodeURIComponent(next)}`
      : next;
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  return response;
}
