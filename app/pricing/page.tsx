"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SUBSCRIPTION_TIERS, CREDIT_PACKS, GENERATION_CREDIT_COST } from "@/lib/presets";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

export default function PricingPage() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session } = useSupabaseUser();
  const router = useRouter();

  async function handleCheckout(id: string, priceId: string | null) {
    setError(null);

    if (!priceId) {
      setError(
        "Cette offre n'est pas encore configurée (variable Stripe manquante). Voir le README pour brancher Stripe."
      );
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    setLoadingId(id);
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

      // Already subscribed: hand off to the Stripe portal instead, which
      // changes the *existing* subscription (with proration) rather than
      // starting a second one on top of it.
      if (res.status === 409 && data.error === "changer_de_plan") {
        const portalRes = await fetch("/api/portal", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const portalData = await portalRes.json();
        if (!portalRes.ok || !portalData.url) {
          setError(portalData.error ?? "Impossible d'ouvrir la gestion d'abonnement.");
          return;
        }
        window.location.assign(portalData.url);
        return;
      }

      if (!res.ok || !data.url) {
        setError(data.error ?? "Erreur inconnue.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Impossible de contacter le serveur de paiement.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Des tarifs simples</h1>
        <p className="mt-3 text-zinc-400">
          Un abonnement qui recharge tes crédits chaque mois, ou des packs à
          l&apos;achat libre si tu préfères sans engagement.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Résiliable en 1 clic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Crédits jamais perdus
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Paiement sécurisé par Stripe
          </span>
        </div>
      </div>

      {error && (
        <p className="mx-auto mt-6 max-w-lg rounded-lg border border-red-800 bg-red-950/50 p-3 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {SUBSCRIPTION_TIERS.map((tier) => (
          <div
            key={tier.id}
            className={`flex flex-col rounded-2xl border p-8 ${
              tier.highlighted
                ? "border-emerald-400 bg-emerald-400/5"
                : "border-zinc-800 bg-zinc-900/40"
            }`}
          >
            {tier.highlighted && (
              <span className="mb-3 w-fit rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold text-black">
                Le plus choisi
              </span>
            )}
            <h2 className="text-xl font-bold">{tier.name}</h2>
            <p className="mt-1 text-sm font-medium text-zinc-300">
              {tier.credits} crédits chaque mois
            </p>
            <p className="mt-1 text-sm text-zinc-400">{tier.tagline}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold">{tier.price}</span>
              <span className="text-zinc-400">{tier.period}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => handleCheckout(tier.id, tier.priceId)}
              disabled={loadingId === tier.id}
              className={`mt-8 rounded-full px-6 py-3 text-center font-bold transition disabled:opacity-60 ${
                tier.highlighted
                  ? "bg-emerald-400 text-black hover:bg-emerald-300"
                  : "border border-zinc-600 text-white hover:border-zinc-400"
              }`}
            >
              {loadingId === tier.id ? "Redirection..." : `Choisir ${tier.name}`}
            </button>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-20 max-w-3xl text-center">
        <h2 className="text-xl font-bold">Besoin de plus de crédits avant ton renouvellement ?</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Achète un pack ponctuel à tout moment, abonné ou non — les crédits
          s&apos;ajoutent à ton solde et ne sont jamais perdus.
        </p>
      </div>

      <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <div
            key={pack.id}
            className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6"
          >
            <h3 className="text-lg font-bold">{pack.credits} crédits</h3>
            <p className="mt-1 text-sm text-zinc-400">{pack.tagline}</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold">{pack.price}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => handleCheckout(pack.id, pack.priceId)}
              disabled={loadingId === pack.id}
              className="mt-6 rounded-full border border-zinc-600 px-6 py-2.5 text-center font-semibold text-white transition hover:border-zinc-400 disabled:opacity-60"
            >
              {loadingId === pack.id ? "Redirection..." : "Acheter ce pack"}
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
            la génération. L&apos;abonnement recharge ce solde chaque mois ; les
            packs le rechargent ponctuellement. Dans les deux cas, les crédits
            ne s&apos;expirent jamais.
          </p>
        </div>
        <div className="rounded-xl border border-emerald-800/40 bg-emerald-400/5 p-6">
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
