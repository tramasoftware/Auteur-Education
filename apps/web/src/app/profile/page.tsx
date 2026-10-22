import type { Metadata } from "next";

import { ProfileScreen } from "@/features/home/ProfileScreen";
import { requireRegistered } from "@/lib/auth/require-registered";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile · Auteur Education",
};

export default async function ProfilePage() {
  await requireRegistered();
  return <ProfileScreen />;
}
