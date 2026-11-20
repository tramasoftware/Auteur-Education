"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError, billing, type BillingOffer } from "@/lib/api";
import { isAnonymousClaim } from "@/lib/auth/claims";
import { createClient } from "@/lib/supabase/browser";

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

export function PlansOffers() {
  const router = useRouter();
  const params = useSearchParams();
  const [offers, setOffers] = useState<BillingOffer[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void billing.offers().then(
      (body) => {
        if (!cancelled) {
          setOffers(body.offers);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setMessage(
            error instanceof ApiError
              ? error.message
              : "Plans could not be loaded.",
          );
          setOffers([]);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const buy = async (offer: BillingOffer) => {
    setMessage(null);
    const supabase = createClient();
    const { data } = await supabase.auth.getClaims();
    if (isAnonymousClaim(data?.claims as Record<string, unknown> | undefined)) {
      router.push("/login?next=%2Fplans");
      return;
    }
    setBusyId(offer.version_id);
    try {
      const session = await billing.checkout(offer.version_id);
      if (!session.url.startsWith("https://")) {
        setMessage("Checkout could not be opened.");
        setBusyId(null);
        return;
      }
      window.location.assign(session.url);
    } catch (error) {
      setBusyId(null);
      if (error instanceof ApiError && error.status === 401) {
        router.push("/login?next=%2Fplans");
        return;
      }
      setMessage(error instanceof ApiError ? error.message : "Checkout could not start.");
    }
  };

  return (
    <main className="lp">
      <section className="lp-port">
        <span className="k">Plans</span>
        <h1>Sandbox prices, not the final offer.</h1>
        <p className="sub">
          Amounts and credits are provisional. A return from checkout does not
          confirm a payment.
        </p>
        {params.get("checkout") === "cancel" ? (
          <p className="billing-note">Checkout was cancelled. No charge was confirmed.</p>
        ) : null}
        {message ? <p className="billing-note">{message}</p> : null}
      </section>
      <section className="lp-sec">
        {offers === null ? <p>Loading plans.</p> : null}
        {offers && offers.length === 0 && !message ? (
          <p>No plans are available in this environment.</p>
        ) : null}
        <div className="planes">
          {(offers ?? []).map((offer) => (
            <article
              className={offer.kind === "subscription" ? "plan destacado" : "plan"}
              key={offer.version_id}
            >
              <span className="k">{offer.kind === "subscription" ? "Monthly" : "One payment"}</span>
              <h3>{offer.display_name}</h3>
              <p className="precio">
                {money(offer.amount_cents, offer.currency)}
                <small>
                  {offer.credits} provisional {offer.credits === 1 ? "credit" : "credits"}
                </small>
              </p>
              <p className="ae-plan-terms">Sandbox figure. Not an approved price.</p>
              {offer.checkout_ready ? (
                <button
                  className="btn"
                  type="button"
                  disabled={busyId === offer.version_id}
                  onClick={() => void buy(offer)}
                >
                  {busyId === offer.version_id ? "Opening checkout" : "Continue to checkout"}
                  <span className="ar" aria-hidden="true" />
                </button>
              ) : (
                <p className="ae-plan-terms">
                  Checkout opens after a sandbox price id is stored for this version.
                </p>
              )}
            </article>
          ))}
        </div>
        <p className="billing-note">
          <Link href="/account">Billing and credits</Link>
        </p>
      </section>
    </main>
  );
}
