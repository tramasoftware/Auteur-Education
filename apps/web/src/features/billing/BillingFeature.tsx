"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ApiError, billing, type BillingAccount } from "@/lib/api";

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

export function BillingFeature() {
  const params = useSearchParams();
  const returned = params.get("checkout") === "return";
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return billing.account().then(
      (body) => {
        setAccount(body);
        setMessage(null);
      },
      (error: unknown) => {
        setMessage(error instanceof ApiError ? error.message : "Billing could not be loaded.");
      },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load();
    if (!returned) {
      return;
    }
    const handle = window.setTimeout(() => {
      if (!cancelled) {
        void load();
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [load, returned]);

  const openPortal = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const session = await billing.portal();
      if (!session.url.startsWith("https://")) {
        setMessage("The billing portal could not be opened.");
        setBusy(false);
        return;
      }
      window.location.assign(session.url);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof ApiError ? error.message : "The billing portal could not be opened.");
    }
  };

  return (
    <main className="lp">
      <section className="lp-port">
        <span className="k">Billing</span>
        <h1>Credits and payments</h1>
        <p className="sub">
          Figures are provisional. A browser return from Stripe does not add credits.
        </p>
        {returned ? (
          <p className="billing-note">
            Checking the recorded payment. The balance changes only after it is stored.
          </p>
        ) : null}
        {message ? <p className="billing-note">{message}</p> : null}
      </section>
      <section className="lp-sec">
        {account ? (
          <>
            <p className="precio">
              {account.balance}
              <small>provisional credits available</small>
            </p>
            <p className="ae-plan-terms">
              {account.subscription
                ? `Subscription ${account.subscription.status}${
                    account.subscription.cancel_at_period_end ? ", cancels at period end" : ""
                  }.`
                : "No subscription is recorded."}
            </p>
            <p>
              <Link className="btn" href="/plans">
                View plans
                <span className="ar" aria-hidden="true" />
              </Link>
            </p>
            {account.has_customer ? (
              <p>
                <button className="btn" type="button" disabled={busy} onClick={() => void openPortal()}>
                  {busy ? "Opening portal" : "Manage billing"}
                </button>
              </p>
            ) : null}
            <h2>Payments</h2>
            {account.payments.length === 0 ? <p>No payments yet.</p> : null}
            <ul className="billing-list">
              {account.payments.map((payment) => (
                <li key={`${payment.created_at}-${payment.status}-${payment.amount_cents}`}>
                  {payment.status} · {money(payment.amount_cents, payment.currency)}
                </li>
              ))}
            </ul>
            <h2>Credit movements</h2>
            {account.movements.length === 0 ? <p>No credit movements yet.</p> : null}
            <ul className="billing-list">
              {account.movements.map((movement) => (
                <li key={`${movement.created_at}-${movement.entry_type}-${movement.delta}`}>
                  {movement.entry_type} · {movement.delta > 0 ? "+" : ""}
                  {movement.delta}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Loading billing.</p>
        )}
      </section>
    </main>
  );
}
