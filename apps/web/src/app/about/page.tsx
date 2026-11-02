import type { Metadata } from "next";

import { AboutPage } from "@/features/landing/AboutPage";

export const metadata: Metadata = {
  title: "About · Auteur Education",
  description: "A question can open a dozen tabs. Auteur gives it a clear path.",
};

export default function About() {
  return <AboutPage />;
}
