"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRICING_TIERS } from "@/lib/presets";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

export default function PricingPage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session } = useSupabaseUser();
  const router = useRouter();

  async function handleCheckout(tierId: string, priceId: string | null) {
    setError(null);

    if (!priceId) {
      setError(
        "Ce plan n'est pas encore configuré (variable Stripe manquante). Voir le README pour brancher Stripe."
      );
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    setLoadingTier(tierId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
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
          Choisis le plan adapté à ton rythme de publication. Annule quand tu veux.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Résiliable en 1 clic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Paiement sécurisé par Stripe
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Aucun engagement de durée
          </span>
        </div>
      </div>

      {error && (
        <p className="mx-auto mt-6 max-w-lg rounded-lg border border-red-800 bg-red-950/50 p-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          </div>
        ))}
      </div>

      <div className="mx-auto mt-16 max-w-3xl space-y-6">
        <h2 className="text-center text-xl font-bold">
          Quelle différence entre les plans ?
        </h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h3 className="font-bold text-zinc-100">Le même outil, un quota d&apos;IA différent</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Les 4 plans donnent accès aux mêmes 10 styles filtres en illimité
            et sans filigrane. Ce qui change, c&apos;est le nombre de
            générations IA génératives incluses chaque mois — plus le plan
            est élevé, plus le quota est grand et plus le prix par génération
            baisse.
          </p>
        </div>
        <div className="rounded-xl border border-yellow-800/40 bg-yellow-400/5 p-6">
          <h3 className="font-bold text-zinc-100">
            L&apos;IA générative : ce qu&apos;elle fait vraiment
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            Les styles filtres ajustent les couleurs de ta photo existante.
            L&apos;amélioration IA va plus loin : elle envoie ta photo à un
            modèle d&apos;IA générative qui retravaille réellement
            l&apos;éclairage, l&apos;ambiance et le décor de l&apos;image,
            tout en gardant ton sujet reconnaissable — un rendu que Photoshop
            ou un simple filtre ne peuvent pas produire. C&apos;est une vraie
            génération IA à chaque fois (pas un filtre), donc chaque plan a un
            quota mensuel plutôt qu&apos;un accès illimité.
          </p>
        </div>
      </div>
    </div>
  );
}
