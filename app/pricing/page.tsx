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
        body: JSON.stringify({ priceId, tier: tierId }),
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
            <p className="mt-1 text-sm font-medium text-zinc-300">{tier.tagline}</p>
            <p className="mt-2 text-sm text-zinc-400">{tier.description}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">{tier.price}</span>
              <span className="text-zinc-400">{tier.period}</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-zinc-300">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-yellow-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {tier.notIncluded.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-zinc-800 pt-3 text-sm text-zinc-500">
                {tier.notIncluded.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5">✕</span>
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex-1" />
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

      <div className="mx-auto mt-16 max-w-3xl space-y-6">
        <h2 className="text-center text-xl font-bold">
          Quelle différence entre les offres ?
        </h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h3 className="font-bold text-zinc-100">
            Free vs Creator — le volume, pas la qualité de base
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            Les deux utilisent les mêmes 9 styles filtres (couleur, contraste,
            texte). La différence, c&apos;est la limite : 3 miniatures avec
            filigrane en Free, illimité et sans filigrane en Creator. Le rendu
            filtre de base est identique.
          </p>
        </div>
        <div className="rounded-xl border border-yellow-800/40 bg-yellow-400/5 p-6">
          <h3 className="font-bold text-zinc-100">
            L&apos;IA générative : incluse en Creator, illimitée en Pro
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            Les styles filtres ajustent les couleurs de ta photo existante.
            L&apos;amélioration IA va plus loin : elle envoie ta photo à un
            modèle d&apos;IA générative qui retravaille réellement
            l&apos;éclairage, l&apos;ambiance et le décor de l&apos;image,
            tout en gardant ton sujet reconnaissable — un rendu que Photoshop
            ou un simple filtre ne peuvent pas produire. Le plan Creator
            inclut 2 générations IA par mois, de quoi tester et
            l&apos;utiliser sur tes vidéos les plus importantes. Le plan Pro
            la rend illimitée — c&apos;est ce qui justifie l&apos;écart de
            prix entre les deux.
          </p>
        </div>
      </div>
    </div>
  );
}
