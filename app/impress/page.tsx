"use client";

import { useState } from "react";
import Link from "next/link";
import { PRICING_TIERS } from "@/lib/presets";
import { getSupabaseBrowser, Profile } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import { useEffect } from "react";
import GeneratingCard from "@/components/motion/GeneratingCard";
import ResultReveal from "@/components/motion/ResultReveal";

const DESCRIPTION_MAX = 400;
const EXAMPLES = [
  "Remplace ma voiture par une Porsche 911 rouge, même angle, même lumière",
  "Ajoute une montre de luxe à mon poignet",
  "Change la façade de ma maison en pierre blanche moderne",
  "Remplace mon t-shirt par une veste en cuir noir",
];

export default function ImpressPage() {
  const { loading: authLoading, session } = useSupabaseUser();
  const loggedIn = Boolean(session);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [upgradeLoadingTier, setUpgradeLoadingTier] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      if (!cancelled && data) setProfile(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isOwnerAccount = session?.user.email?.toLowerCase() === "mathis.ferry76@gmail.com";
  const isPaid = isOwnerAccount || (profile ? profile.plan !== "free" : false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setResultUrl(null);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function handleGenerate() {
    setError(null);
    if (!file) {
      setError("Ajoute d'abord une photo.");
      return;
    }
    if (!description.trim()) {
      setError("Décris le changement que tu veux voir.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("description", description.trim());

      const res = await fetch("/api/impress", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur pendant la retouche.");
        return;
      }
      setResultUrl(data.image);
      setShowOriginal(false);
    } catch {
      setError("Impossible de contacter le serveur. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(tierId: string, priceId: string | null) {
    setUpgradeError(null);
    if (!priceId) {
      setUpgradeError("Ce plan n'est pas encore configuré (variable Stripe manquante).");
      return;
    }
    if (!session) return;
    setUpgradeLoadingTier(tierId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ priceId, tier: tierId }),
      });
      const data = await res.json();
      if (res.status === 409 && data.error === "changer_de_plan") {
        const portalRes = await fetch("/api/portal", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const portalData = await portalRes.json();
        if (!portalRes.ok || !portalData.url) {
          setUpgradeError(portalData.error ?? "Impossible d'ouvrir la gestion d'abonnement.");
          return;
        }
        window.location.assign(portalData.url);
        return;
      }
      if (!res.ok || !data.url) {
        setUpgradeError(data.error ?? "Erreur inconnue.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setUpgradeError("Impossible de contacter le serveur de paiement.");
    } finally {
      setUpgradeLoadingTier(null);
    }
  }

  if (authLoading || (loggedIn && !profile && !isOwnerAccount)) {
    return <div className="mx-auto w-full max-w-6xl px-6 py-16 text-zinc-500">Chargement...</div>;
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">✨ Impressionne tes potes</h1>
        <p className="mt-3 text-zinc-400">
          Connecte-toi pour transformer n&apos;importe quelle photo — ta voiture,
          ta maison, toi-même — en un seul détail modifié, ultra-réaliste.
        </p>
        <Link
          href="/login"
          className="mt-6 rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  if (!isPaid) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-2xl font-extrabold">✨ Impressionne tes potes</h1>
          <p className="mt-3 text-zinc-400">
            Prends une photo — ta voiture, ta maison, toi — et décris un seul
            changement (&quot;remplace ma voiture par une Porsche&quot;,
            &quot;ajoute une montre à mon poignet&quot;...). L&apos;IA applique
            exactement ce changement, sans toucher au reste : résultat
            crédible, pas sur-retouché. Réservé aux abonnés.
          </p>
        </div>

        {upgradeError && (
          <p className="mx-auto mt-6 max-w-lg rounded-lg border border-red-800 bg-red-950/50 p-3 text-center text-sm text-red-300">
            {upgradeError}
          </p>
        )}

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`flex flex-col rounded-2xl border p-6 ${
                tier.highlighted ? "border-yellow-400 bg-yellow-400/5" : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              {tier.highlighted && (
                <span className="mb-3 w-fit rounded-full bg-yellow-400 px-3 py-1 text-xs font-bold text-black">
                  Le plus choisi
                </span>
              )}
              <h2 className="text-lg font-bold">{tier.name}</h2>
              <p className="mt-1 text-sm text-zinc-400">{tier.tagline}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold">{tier.price}</span>
                <span className="text-zinc-400">{tier.period}</span>
              </div>
              <div className="flex-1" />
              <button
                onClick={() => handleUpgrade(tier.id, tier.priceId)}
                disabled={upgradeLoadingTier === tier.id}
                className={`mt-6 rounded-full px-6 py-3 text-center font-bold transition disabled:opacity-60 ${
                  tier.highlighted
                    ? "bg-yellow-400 text-black hover:bg-yellow-300"
                    : "border border-zinc-600 text-white hover:border-zinc-400"
                }`}
              >
                {upgradeLoadingTier === tier.id ? "Redirection..." : tier.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">✨ Impressionne tes potes</h1>
      <p className="mt-2 text-zinc-400">
        Prends une photo, décris un seul changement précis. L&apos;IA applique
        exactement ça — rien de plus — pour un résultat crédible.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">1. Ta photo</label>
            <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Aperçu" className="h-full w-full object-contain" />
              ) : (
                <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-zinc-400 transition hover:border-zinc-500">
                  <span className="text-3xl">📷</span>
                  <span className="mt-2 text-sm">Clique pour choisir une photo</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              )}
            </div>
            {previewUrl && (
              <label className="mt-2 inline-block cursor-pointer text-xs font-semibold text-zinc-400 hover:text-white">
                Changer de photo
                <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </label>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-semibold text-zinc-300">
                2. Décris LE changement à apporter
              </label>
              <span className="text-xs text-zinc-500">
                {description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              rows={3}
              placeholder="Ex : remplace ma voiture par une Porsche 911 rouge, même angle, même lumière"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setDescription(ex)}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-white"
                >
                  {ex.length > 40 ? ex.slice(0, 40) + "…" : ex}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading || !file}
            className="w-full rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Retouche en cours..." : "Générer →"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {resultUrl && previewUrl && (
            <div className="flex overflow-hidden self-center rounded-full border border-zinc-700 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className={`px-3 py-1 transition ${!showOriginal ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"}`}
              >
                Après
              </button>
              <button
                type="button"
                onClick={() => setShowOriginal(true)}
                className={`px-3 py-1 transition ${showOriginal ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"}`}
              >
                Avant
              </button>
            </div>
          )}
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
            {loading ? (
              <GeneratingCard label="Retouche en cours..." />
            ) : resultUrl ? (
              <ResultReveal src={showOriginal ? previewUrl! : resultUrl} revealKey={showOriginal ? "before" : resultUrl} />
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Aperçu" className="h-full w-full object-contain opacity-40" />
            ) : (
              <p className="px-6 text-center text-sm text-zinc-600">
                Le résultat apparaîtra ici après génération.
              </p>
            )}
          </div>
          {resultUrl && (
            <a
              href={resultUrl}
              download="impression.png"
              className="rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold text-white transition hover:border-zinc-400"
            >
              Télécharger
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
