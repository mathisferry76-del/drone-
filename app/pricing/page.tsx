"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CREDIT_PACKS, GENERATION_CREDIT_COST } from "@/lib/presets";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

export default function PricingPage() {
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session } = useSupabaseUser();
  const router = useRouter();

  async function handleCheckout(packId: string, priceId: string | null) {
    setError(null);

    if (!priceId) {
      setError(
        "Ce pack n'est pas encore configuré (variable Stripe manquante). Voir le README pour brancher Stripe."
      );
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    setLoadingPack(packId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
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
      setLoadingPack(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Des crédits, pas d&apos;abonnement</h1>
        <p className="mt-3 text-zinc-400">
          Achète un pack de crédits, dépense-les à ton rythme. Aucun
          renouvellement automatique, aucune date d&apos;engagement.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Crédits sans date d&apos;expiration
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Paiement sécurisé par Stripe
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Aucun abonnement
          </span>
        </div>
      </div>

      {error && (
        <p className="mx-auto mt-6 max-w-lg rounded-lg border border-red-800 bg-red-950/50 p-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <div
            key={pack.id}
            className={`flex flex-col rounded-2xl border p-8 ${
              pack.highlighted
                ? "border-yellow-400 bg-yellow-400/5"
                : "border-zinc-800 bg-zinc-900/40"
            }`}
          >
            {pack.highlighted && (
              <span className="mb-3 w-fit rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-black">
                Le plus choisi
              </span>
            )}
            <h2 className="text-xl font-bold">{pack.credits} crédits</h2>
            <p className="mt-1 text-sm font-medium text-zinc-300">{pack.tagline}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">{pack.price}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => handleCheckout(pack.id, pack.priceId)}
              disabled={loadingPack === pack.id}
              className={`mt-8 rounded-full px-6 py-3 text-center font-bold transition disabled:opacity-60 ${
                pack.highlighted
                  ? "bg-yellow-400 text-black hover:bg-yellow-300"
                  : "border border-zinc-600 text-white hover:border-zinc-400"
              }`}
            >
              {loadingPack === pack.id ? "Redirection..." : "Acheter ce pack"}
            </button>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-16 max-w-3xl space-y-6">
        <h2 className="text-center text-xl font-bold">
          Comment fonctionnent les crédits ?
        </h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h3 className="font-bold text-zinc-100">Styles filtres gratuits, IA générative sur crédits</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Les styles filtres (recadrage, couleurs, texte) sont gratuits et
            illimités pour tout compte connecté. Chaque génération avec l&apos;IA
            générative — miniature ou &laquo;&nbsp;Impressionne tes potes&nbsp;&raquo; — coûte{" "}
            {GENERATION_CREDIT_COST} crédits, débités de ton solde au moment de
            la génération.
          </p>
        </div>
        <div className="rounded-xl border border-yellow-800/40 bg-yellow-400/5 p-6">
          <h3 className="font-bold text-zinc-100">
            L&apos;IA générative : ce qu&apos;elle fait vraiment
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            L&apos;amélioration IA envoie ta photo à un modèle d&apos;IA
            générative qui retravaille réellement l&apos;éclairage,
            l&apos;ambiance et le décor de l&apos;image, tout en gardant ton
            sujet reconnaissable — un rendu que Photoshop ou un simple filtre
            ne peuvent pas produire. C&apos;est une vraie génération à chaque
            fois, d&apos;où le coût en crédits plutôt qu&apos;un accès
            illimité.
          </p>
        </div>
      </div>
    </div>
  );
}
