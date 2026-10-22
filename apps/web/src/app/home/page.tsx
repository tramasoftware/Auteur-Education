import type { Metadata } from "next";

import { HomeScreen } from "@/features/home/HomeScreen";
import { requireRegistered } from "@/lib/auth/require-registered";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home · Auteur Education",
};

export default async function HomePage() {
  await requireRegistered();
  return <HomeScreen />;
}
