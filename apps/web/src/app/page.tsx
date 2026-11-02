import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPage } from "@/features/landing";
import { accountSession } from "@/lib/auth/claims";
import { fetchGeneratedCourseCount } from "@/lib/auth/entry";
import { canAccessMemberHome, DEFAULT_MEMBER_PATH } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create the course you wish existed · Auteur Education",
  description: "Built around your question, your goal, and what you already know.",
};

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const session = accountSession(
    error ? undefined : (data?.claims as Record<string, unknown> | undefined),
  );
  if (session.status === "registered") {
    const { data: sessionData } = await supabase.auth.getSession();
    try {
      const count = await fetchGeneratedCourseCount(sessionData.session?.access_token);
      if (canAccessMemberHome(count)) {
        redirect(DEFAULT_MEMBER_PATH);
      }
    } catch {
      // Stay on the landing rather than sending the member to onboarding.
    }
  }

  return <LandingPage />;
}
