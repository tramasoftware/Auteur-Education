"use client";

import { useEffect } from "react";

import { accountSession } from "@/lib/auth/claims";
import { getAccountProfile } from "@/lib/api";
import {
  accountStampNow,
  clearMemberDisplay,
  currentUserId,
  rememberFetchedAccount,
} from "@/lib/member-display";
import {
  clearReadingPreference,
  rememberReadingPreference,
} from "@/lib/reading-preference";
import { createClient } from "@/lib/supabase/browser";

/** Applies the signed-in member's saved text size, the way a language preference would. */
export function ReadingPreferenceSync() {
  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const { data, error } = await createClient().auth.getClaims();
      if (cancelled || error) {
        return;
      }
      const session = accountSession(data?.claims as Record<string, unknown> | undefined);
      if (session.status !== "registered") {
        clearReadingPreference();
        clearMemberDisplay();
        return;
      }
      const stamp = accountStampNow();
      try {
        const profile = await getAccountProfile();
        if (!cancelled) {
          rememberReadingPreference(profile.text_size);
          const userId = await currentUserId();
          if (userId) {
            rememberFetchedAccount(userId, profile, stamp);
          }
        }
      } catch {
        // Keep the size already painted from the cookie.
      }
    }

    void sync();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
