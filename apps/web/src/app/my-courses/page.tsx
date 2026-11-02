import type { Metadata } from "next";

import { MyCoursesScreen } from "@/features/home/MyCoursesScreen";
import { requireRegistered } from "@/lib/auth/require-registered";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My courses · Auteur Education",
};

export default async function MyCoursesPage() {
  await requireRegistered();
  return <MyCoursesScreen />;
}
