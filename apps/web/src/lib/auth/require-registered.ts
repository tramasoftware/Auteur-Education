import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { accountSession } from "./claims";

/** Registered session only. Anonymous and signed-out visitors go to the public landing. */
export async function requireRegistered() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const session = accountSession(
    error ? undefined : (data?.claims as Record<string, unknown> | undefined),
  );
  if (session.status !== "registered") {
    redirect("/");
  }
  return session;
}
