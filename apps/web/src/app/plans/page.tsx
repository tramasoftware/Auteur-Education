import type { Metadata } from "next";

import { PlansPage } from "@/features/landing/PlansPage";

export const metadata: Metadata = {
  title: "Plans · Auteur Education",
  description: "Your first lesson is free with an account. No card needed. Prices in USD, including VAT.",
};

export default function Plans() {
  return <PlansPage />;
}
