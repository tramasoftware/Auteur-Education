import type { Metadata } from "next";

import { HomeScreen } from "@/features/home/HomeScreen";
import { requireMemberHome } from "@/lib/auth/require-member-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home · Auteur Education",
};

export default async function HomePage() {
  await requireMemberHome();
  return <HomeScreen />;
}
