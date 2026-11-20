import type { Metadata } from "next";

import { PlansPage } from "@/features/landing/PlansPage";

export const metadata: Metadata = {
  title: "Plans · Auteur Education",
  description: "Provisional sandbox plans. Prices and credits are not the final offer.",
};

export default function Plans() {
  return <PlansPage />;
}
