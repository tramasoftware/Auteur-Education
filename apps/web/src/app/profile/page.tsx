import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ProfileScreen } from "@/features/home/ProfileScreen";
import { requireRegistered } from "@/lib/auth/require-registered";
import { TEXT_SIZE_COOKIE, textSizeOrStandard } from "@/lib/reading-preference";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile · Auteur Education",
};

export default async function ProfilePage() {
  await requireRegistered();
  const cookieStore = await cookies();
  const initialTextSize = textSizeOrStandard(cookieStore.get(TEXT_SIZE_COOKIE)?.value);
  return <ProfileScreen initialTextSize={initialTextSize} />;
}
