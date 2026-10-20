import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthScreen } from "@/features/auth/AuthScreen";

export const metadata: Metadata = {
  title: "Log in · Auteur Education",
};

export default function LoginPage() {
  return (
    <>
      <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://api.fontshare.com/v2/css?f[]=gambetta@400,401,500&display=swap"
      />
      <Suspense fallback={<p className="px-6 py-16 text-sm text-muted">Loading…</p>}>
        <AuthScreen />
      </Suspense>
    </>
  );
}
