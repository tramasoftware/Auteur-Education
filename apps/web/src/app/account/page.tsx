import { AccountScreen } from "@/features/auth/AccountScreen";

export default function AccountPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">Account</h1>
      <AccountScreen />
    </main>
  );
}
