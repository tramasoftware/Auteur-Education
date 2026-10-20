import type { Metadata } from "next";

import { LandingPage } from "@/features/landing";

export const metadata: Metadata = {
  title: "Create the course you wish existed · Auteur Education",
  description: "Built around your question, your goal, and what you already know.",
};

export default function Home() {
  return <LandingPage />;
}
