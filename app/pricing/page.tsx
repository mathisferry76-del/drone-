"use client";

import { useState } from "react";
import Link from "next/link";
import { PRICING_TIERS } from "@/lib/presets";

export default function PricingPage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(tierId: string, priceId: string | null) {
    if (tierId === "free") return;
    setError(null);

    if (!priceId) {
      setError(
        "Ce plan n'est pas encore configuré (variable Stripe manquante). Voir le README pour brancher Stripe."
      );
      return;
    }

    setLoadingTier(tierId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Erreur inconnue.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Impossible de contacter le serveur de paiement.");
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Des tarifs simples</h1>
        <p className="mt-3 text-zinc-400">
          Annule quand tu veux. Pas de carte bancaire pour l&apos;offre gratuite.
        </p>
      </div>

      {error && (
        <p className="mx-auto mt-6 max-w-lg rounded-lg border border-red-800 bg-red-950/50 p-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {PRICING_TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`flex flex-col rounded-2xl border p-8 ${
              tier.highlighted
                ? "border-yellow-400 bg-yellow-400/5"
                : "border-zinc-800 bg-zinc-900/40"
            }`}
          >
            {tier.highlighted && (
              <span className="mb-3 w-fit rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-black">
                Le plus choisi
              </span>
            )}
            <h2 className="text-xl font-bold">{tier.name}</h2>
            <p className="mt-1 text-sm text-zinc-400">{tier.description}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">{tier.price}</span>
              <span className="text-zinc-400">{tier.period}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-300">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-yellow-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {tier.id === "free" ? (
              <Link
                href="/generate"
                className="mt-8 rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold transition hover:border-zinc-400"
              >
                {tier.cta}
              </Link>
            ) : (
              <button
                onClick={() => handleCheckout(tier.id, tier.priceId)}
                disabled={loadingTier === tier.id}
                className={`mt-8 rounded-full px-6 py-3 text-center font-bold transition disabled:opacity-60 ${
                  tier.highlighted
                    ? "bg-yellow-400 text-black hover:bg-yellow-300"
                    : "border border-zinc-600 text-white hover:border-zinc-400"
                }`}
              >
                {loadingTier === tier.id ? "Redirection..." : tier.cta}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
