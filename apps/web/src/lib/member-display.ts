import type { AccountProfile } from "@/lib/api";
import { createClient } from "@/lib/supabase/browser";
import type { CourseList } from "@/types/generator";

const STORAGE_KEY = "auteur-member-display";

/** Bumps when the member saves a name or photo, so a late GET cannot overwrite it. */
let accountStamp = 0;

/** Header and library fields kept while this account stays signed in. */
export type MemberDisplay = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  avatarUrl: string | null;
  inProgressCount: number;
  library: CourseList | null;
};

type DisplayPatch = Partial<Omit<MemberDisplay, "userId">>;

export async function currentUserId(): Promise<string | null> {
  const { data, error } = await createClient().auth.getClaims();
  if (error) {
    return null;
  }
  const sub = (data?.claims as { sub?: unknown } | undefined)?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

function isDisplay(value: unknown, userId: string): value is MemberDisplay {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as MemberDisplay;
  if (row.userId !== userId) {
    return false;
  }
  if (row.library !== null) {
    if (!row.library || !Array.isArray(row.library.courses)) {
      return false;
    }
  }
  return true;
}

export function readMemberDisplay(userId: string): MemberDisplay | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isDisplay(parsed, userId) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMemberDisplay(userId: string, patch: DisplayPatch): void {
  const current = readMemberDisplay(userId);
  const next: MemberDisplay = {
    firstName: current?.firstName ?? null,
    lastName: current?.lastName ?? null,
    imageUrl: current?.imageUrl ?? null,
    avatarUrl: current?.avatarUrl ?? null,
    inProgressCount: current?.inProgressCount ?? 0,
    library: current?.library ?? null,
    ...patch,
    userId,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing can block storage. The next visit refetches.
  }
}

export function accountStampNow(): number {
  return accountStamp;
}

export function rememberAccount(userId: string, account: AccountProfile): void {
  accountStamp += 1;
  writeAccount(userId, account);
}

/** Keep a profile GET only when the member has not saved something newer. */
export function rememberFetchedAccount(
  userId: string,
  account: AccountProfile,
  stamp: number,
): void {
  if (stamp !== accountStamp) {
    return;
  }
  writeAccount(userId, account);
}

function writeAccount(userId: string, account: AccountProfile): void {
  writeMemberDisplay(userId, {
    firstName: account.first_name,
    lastName: account.last_name,
    imageUrl: account.image_url,
    avatarUrl: account.avatar_url,
  });
}

export function clearMemberDisplay(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures on logout.
  }
}
