import { Suspense } from "react";

import { AuthScreen } from "@/features/auth/AuthScreen";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <AuthScreen />
      </Suspense>
    </main>
  );
}
