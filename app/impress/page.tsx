"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { CREDIT_PACKS, GENERATION_CREDIT_COST } from "@/lib/presets";
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
  const [resultWasTrial, setResultWasTrial] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  // Tracks each image's real aspect ratio so the preview/result boxes show
  // the photo as sent — portrait stays tall, landscape stays wide — instead
  // of forcing every photo into a fixed 16:9 "YouTube" box.
  const [previewAspect, setPreviewAspect] = useState<number | null>(null);
  const [resultAspect, setResultAspect] = useState<number | null>(null);
  // Lets the "Annuler" button interrupt an in-flight generation — aborting
  // the fetch also aborts the actual outbound request to the AI provider
  // server-side (see app/api/impress/route.ts), and the server refunds the
  // trial/credits reservation either way, so cancelling costs nothing on
  // either side.
  const abortControllerRef = useRef<AbortController | null>(null);

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
  const creditsBalance = profile?.credits_balance ?? 0;
  // Same account-wide trial counter as /generate — one free AI generation
  // total, usable on either feature, not one freebie per feature.
  const hasFreeTrialAvailable = !isOwnerAccount && (profile?.free_generations_used ?? 0) < 1;
  const hasCredits = isOwnerAccount || creditsBalance >= GENERATION_CREDIT_COST;
  const canTryTool = hasFreeTrialAvailable || hasCredits;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setResultUrl(null);
    setResultAspect(null);
    setPreviewAspect(null);
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

    // Captured before the request: reserve_credits always spends the trial
    // first when it's available, regardless of credit balance, so this is
    // what determines whether the result we're about to get is watermarked
    // — reading hasFreeTrialAvailable again after the profile refetch below
    // would already reflect the trial as consumed.
    const usingTrial = hasFreeTrialAvailable;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("description", description.trim());

      const res = await fetch("/api/impress", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: formData,
        signal: controller.signal,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur pendant la retouche.");
        return;
      }
      setResultUrl(data.image);
      setResultWasTrial(usingTrial);
      setShowOriginal(false);

      // Refresh the profile so free_generations_used/credits_balance reflect
      // what was just spent — otherwise the free banner or credit count
      // would stay stale until a full page reload.
      if (session) {
        const supabase = getSupabaseBrowser();
        const { data: fresh } = await supabase!
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (fresh) setProfile(fresh as Profile);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User-initiated cancel, not a real error — the server has already
        // (or is about to) refund the trial/credits reservation, so just
        // resync the displayed balance once that's had time to land.
        if (session) {
          setTimeout(async () => {
            const supabase = getSupabaseBrowser();
            const { data: fresh } = await supabase!
              .from("profiles")
              .select("*")
              .eq("id", session.user.id)
              .single();
            if (fresh) setProfile(fresh as Profile);
          }, 800);
        }
      } else {
        setError("Impossible de contacter le serveur. Réessaie.");
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleCancelGenerate() {
    abortControllerRef.current?.abort();
  }

  async function handleBuyCredits(packId: string, priceId: string | null) {
    setUpgradeError(null);
    if (!priceId) {
      setUpgradeError("Ce pack n'est pas encore configuré (variable Stripe manquante).");
      return;
    }
    if (!session) return;
    setUpgradeLoadingTier(packId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ priceId, packId }),
      });
      const data = await res.json();
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
          className="mt-6 rounded-full bg-emerald-400 px-6 py-3 font-bold text-black transition hover:bg-emerald-300"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  if (!canTryTool) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-2xl font-extrabold">✨ Impressionne tes potes</h1>
          <p className="mt-3 text-zinc-400">
            Prends une photo — ta voiture, ta maison, toi — et décris un seul
            changement (&quot;remplace ma voiture par une Porsche&quot;,
            &quot;ajoute une montre à mon poignet&quot;...). L&apos;IA applique
            exactement ce changement, sans toucher au reste : résultat
            crédible, pas sur-retouché.
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            Ton essai gratuit a déjà été utilisé — achète des crédits pour
            continuer ({GENERATION_CREDIT_COST} crédits par génération).
          </p>
        </div>

        {upgradeError && (
          <p className="mx-auto mt-6 max-w-lg rounded-lg border border-red-800 bg-red-950/50 p-3 text-center text-sm text-red-300">
            {upgradeError}
          </p>
        )}

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              className={`flex flex-col rounded-2xl border p-6 ${
                pack.highlighted ? "border-emerald-400 bg-emerald-400/5" : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              {pack.highlighted && (
                <span className="mb-3 w-fit rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold text-black">
                  Le plus choisi
                </span>
              )}
              <h2 className="text-lg font-bold">{pack.credits} crédits</h2>
              <p className="mt-1 text-sm text-zinc-400">{pack.tagline}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold">{pack.price}</span>
              </div>
              <div className="flex-1" />
              <button
                onClick={() => handleBuyCredits(pack.id, pack.priceId)}
                disabled={upgradeLoadingTier === pack.id}
                className={`mt-6 rounded-full px-6 py-3 text-center font-bold transition disabled:opacity-60 ${
                  pack.highlighted
                    ? "bg-emerald-400 text-black hover:bg-emerald-300"
                    : "border border-zinc-600 text-white hover:border-zinc-400"
                }`}
              >
                {upgradeLoadingTier === pack.id ? "Redirection..." : "Acheter"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <ResultReveal src={resultUrl} revealKey={resultUrl} />
      <h1 className="text-3xl font-extrabold">✨ Impressionne tes potes</h1>
      <p className="mt-2 text-zinc-400">
        Prends une photo, décris un seul changement précis. L&apos;IA applique
        exactement ça — rien de plus — pour un résultat crédible.
      </p>
      {hasFreeTrialAvailable && (
        <p className="mt-3 rounded-lg border border-emerald-800/40 bg-emerald-400/5 px-4 py-2 text-sm text-emerald-300">
          🎁 Ton essai gratuit — un vrai résultat, avec filigrane. Achète des
          crédits pour débloquer sans filigrane et continuer.
        </p>
      )}
      {!hasFreeTrialAvailable && !isOwnerAccount && (
        <p className="mt-3 text-sm text-zinc-500">
          {creditsBalance} crédits disponibles ({Math.floor(creditsBalance / GENERATION_CREDIT_COST)} génération(s)).
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">1. Ta photo</label>
            <div
              className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 ${
                previewUrl ? "" : "aspect-video"
              }`}
              style={previewUrl && previewAspect ? { aspectRatio: previewAspect, maxHeight: "70vh" } : undefined}
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Aperçu"
                  className="h-full w-full object-contain"
                  onLoad={(e) =>
                    setPreviewAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)
                  }
                />
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
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
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

          {loading ? (
            <button
              onClick={handleCancelGenerate}
              className="w-full rounded-full border border-red-500/60 px-6 py-3 font-bold text-red-400 transition hover:bg-red-500/10"
            >
              Annuler
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!file}
              className="w-full rounded-full bg-emerald-400 px-6 py-3 font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Générer →
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {resultUrl && previewUrl && (
            <div className="flex overflow-hidden self-center rounded-full border border-zinc-700 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className={`px-3 py-1 transition ${!showOriginal ? "bg-emerald-400 text-black" : "text-zinc-400 hover:text-white"}`}
              >
                Après
              </button>
              <button
                type="button"
                onClick={() => setShowOriginal(true)}
                className={`px-3 py-1 transition ${showOriginal ? "bg-emerald-400 text-black" : "text-zinc-400 hover:text-white"}`}
              >
                Avant
              </button>
            </div>
          )}
          <div
            className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 ${
              resultUrl ? "" : "aspect-video"
            }`}
            style={resultUrl && resultAspect ? { aspectRatio: resultAspect, maxHeight: "70vh" } : undefined}
          >
            {loading ? (
              <GeneratingCard label="Retouche en cours..." />
            ) : resultUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={showOriginal && previewUrl ? previewUrl : resultUrl}
                  alt={showOriginal ? "Photo originale" : "Résultat généré"}
                  className={`h-full w-full object-contain ${
                    resultWasTrial && !showOriginal ? "scale-110 blur-xl" : ""
                  }`}
                  onLoad={(e) => {
                    if (!showOriginal) {
                      setResultAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
                    }
                  }}
                />
                {resultWasTrial && !showOriginal && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 p-6 text-center">
                    <span className="text-3xl">🔒</span>
                    <p className="text-sm font-semibold text-white">
                      Ton résultat est prêt
                    </p>
                    <Link
                      href="/pricing"
                      className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-bold text-black transition hover:scale-105 hover:bg-emerald-300"
                    >
                      🔓 Débloquer mon résultat
                    </Link>
                  </div>
                )}
              </>
            ) : previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Aperçu" className="h-full w-full object-contain opacity-40" />
            ) : (
              <p className="px-6 text-center text-sm text-zinc-600">
                Le résultat apparaîtra ici après génération.
              </p>
            )}
          </div>
          {resultUrl && (!resultWasTrial ? (
            <a
              href={resultUrl}
              download="impression.png"
              className="rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold text-white transition hover:border-zinc-400"
            >
              Télécharger
            </a>
          ) : (
            <Link
              href="/pricing"
              className="rounded-full bg-emerald-400 px-6 py-3 text-center font-bold text-black transition hover:bg-emerald-300"
            >
              Passe sur un plan pour télécharger sans filigrane
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
