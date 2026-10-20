import type { Metadata } from "next";

import { NotFoundScreen } from "@/features/not-found/NotFoundScreen";

export const metadata: Metadata = {
  title: "Page not found · Auteur Education",
};

export default function NotFound() {
  return <NotFoundScreen />;
}
