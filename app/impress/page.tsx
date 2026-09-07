"use client";

import { useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CREDIT_PACKS, GENERATION_CREDIT_COST, VIDEO_CREDIT_COST } from "@/lib/presets";
import { getSupabaseBrowser, Profile } from "@/lib/supabase";
import { downloadFile } from "@/lib/download";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import { useEffect } from "react";
import GeneratingCard from "@/components/motion/GeneratingCard";
import ResultReveal from "@/components/motion/ResultReveal";

// Kept in sync with MAX_DESCRIPTION in app/api/impress/route.ts — raised
// from 400 since a precise brand-fidelity description (exact wordmark
// spelling, emblem placement, paddle shifters, drive-mode selector
// labels...) routinely needs more room than that.
const DESCRIPTION_MAX = 1200;
const EXAMPLES = [
  "Remplace ma voiture par une Porsche 911 rouge, même angle, même lumière",
  "Ajoute une montre de luxe à mon poignet",
  "Change la façade de ma maison en pierre blanche moderne",
  "Remplace mon t-shirt par une veste en cuir noir",
];
// Vidéo (Veo 3.1) : mêmes limites de longueur que la description image,
// exemples orientés mouvement/caméra plutôt que remplacement d'objet.
// Deux défauts confirmés en production ont chacun fait bouger cette
// liste : (1) l'orbite complète autour d'un véhicule force l'IA à inventer
// les côtés/l'arrière jamais photographiés, et elle peut dériver vers une
// silhouette différente (un break qui devient une berline) — descendue en
// dernier et reformulée en mouvement léger plutôt qu'une pleine rotation ;
// (2) "zoom avant" recommandé en premier a fait sortir le sujet du cadre
// dès le test suivant — retiré des exemples, remplacé par des mouvements
// qui ne changent quasiment rien au cadrage.
const VIDEO_EXAMPLES = [
  "La caméra reste fixe, seuls les reflets de lumière bougent doucement sur la carrosserie",
  "Le vent fait légèrement bouger mes cheveux et mes vêtements",
  "La caméra pivote très légèrement autour de la voiture, reflets qui bougent sur la carrosserie",
];

// Narration affichée pendant la génération (GeneratingCard) — donne
// l'impression qu'un vrai travail d'analyse se déroule, plutôt qu'un seul
// message figé, pour rendre le moment du dévoilement (résultat flouté à
// débloquer sur l'essai gratuit) plus fort. Vidéo a sa propre séquence, plus
// longue, puisque Veo 3.1 prend nettement plus de temps qu'une image.
const IMAGE_GENERATION_STEPS = [
  "Analyse de ta photo...",
  "Détection de l'angle, de la perspective et de la lumière...",
  "Application de la modification demandée...",
  "Vérification de la fidélité au modèle et des détails...",
  "Finalisation du rendu...",
];
const VIDEO_GENERATION_STEPS = [
  "Analyse de ta photo...",
  "Composition du mouvement de caméra...",
  "Génération de la vidéo (Veo 3.1)...",
  "Synchronisation du son...",
  "Encodage final en 1080p (peut prendre plusieurs minutes)...",
];

function ImpressPageInner() {
  const searchParams = useSearchParams();
  const { loading: authLoading, session } = useSupabaseUser();
  const loggedIn = Boolean(session);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [upgradeLoadingTier, setUpgradeLoadingTier] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Optional real photo of the exact object's design (a watch dial, a
  // card's engraved pattern...) — passed straight through to whichever
  // provider supports multiple reference images (see app/api/impress/
  // route.ts), with no automated lookup on our side. The earlier attempt at
  // fetching this automatically added real latency/reliability risk for a
  // benefit that never panned out; letting the user attach a photo they
  // already have sidesteps that entirely.
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  // Prefills from the landing page's interactive hero CTA (see
  // components/ImpressHeroCta.tsx), which sends the visitor here (through
  // /login's `redirect` param when logged out) with the change they typed
  // before ever creating an account already carried over — so signing up
  // feels like unlocking something already in progress, not a wall.
  const [description, setDescription] = useState(() =>
    (searchParams.get("description") ?? "").slice(0, DESCRIPTION_MAX)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultWasTrial, setResultWasTrial] = useState(false);
  // Set when the server shipped the least-bad candidate anyway despite no
  // judge confirming it actually respects the original photo / the exact
  // requested change (see app/api/impress/route.ts) — shown as a warning
  // instead of silently presenting it as a clean success.
  const [resultImperfect, setResultImperfect] = useState(false);
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

  // Vidéo (Veo 3.1, voir app/api/animate/route.ts) : partage la même photo
  // que le mode image
  // (state `file`/`previewUrl` ci-dessus) mais avec sa propre description,
  // son propre résultat et son propre statut de chargement/erreur, puisque
  // les deux modes appellent des routes différentes et peuvent échouer
  // indépendamment l'un de l'autre.
  // Lets a direct link (e.g. the old standalone /animate page, now a
  // redirect) open straight into video mode via ?mode=video.
  const [mode, setMode] = useState<"image" | "video">(() =>
    searchParams.get("mode") === "video" ? "video" : "image"
  );
  const [videoDescription, setVideoDescription] = useState("");
  // Veo itself only ever renders 16:9 — "portrait" asks the server to crop
  // that real 16:9 result into 9:16 afterward (see app/api/animate/
  // route.ts and lib/video-crop.ts), trading the left/right edges of the
  // frame for a clip that actually fills a vertical (Story-shaped) screen
  // instead of the black-bar result a native "9:16" request produces.
  const [videoFormat, setVideoFormat] = useState<"landscape" | "portrait">("landscape");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [downloadingVideo, setDownloadingVideo] = useState(false);
  const videoAbortControllerRef = useRef<AbortController | null>(null);
  const [grantingCredits, setGrantingCredits] = useState(false);

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
    setVideoError(null);
    setVideoUrl(null);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(f);
  }

  function handleReferenceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setReferenceFile(f);
    const reader = new FileReader();
    reader.onload = () => setReferencePreviewUrl(reader.result as string);
    reader.readAsDataURL(f);
  }

  function handleRemoveReference() {
    setReferenceFile(null);
    setReferencePreviewUrl(null);
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

    // Clears the previous result before firing a new request — without
    // this, a failed/errored generation left the last successful result on
    // screen with only a small error message to notice, easy to miss and
    // easy to mistake for the output of the new (failed) request.
    setResultUrl(null);
    setResultAspect(null);
    setResultImperfect(false);
    setShowOriginal(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("description", description.trim());
      if (referenceFile) {
        formData.append("reference", referenceFile);
      }

      const res = await fetch("/api/impress", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: formData,
        signal: controller.signal,
      });

      let data: { image?: string; error?: string; imperfect?: boolean };
      try {
        data = await res.json();
      } catch {
        // The server always responds with JSON, success or failure (see
        // app/api/impress/route.ts) — a body that fails to parse means
        // something in front of it (Vercel, a proxy) cut the response short
        // instead, almost always because the request ran too long. Surface
        // that distinctly instead of falling into the generic
        // "impossible de contacter le serveur" below, which reads like a
        // network outage rather than a slow generation.
        setError(
          "Le serveur a mis trop de temps à répondre ou a coupé la connexion. Réessaie avec une photo plus légère ou une description plus courte."
        );
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Erreur pendant la retouche.");
        return;
      }
      setResultUrl(data.image ?? null);
      setResultWasTrial(usingTrial);
      setResultImperfect(Boolean(data.imperfect));
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

  async function handleGenerateVideo() {
    setVideoError(null);
    if (!file) {
      setVideoError("Ajoute d'abord une photo.");
      return;
    }
    if (!videoDescription.trim()) {
      setVideoError("Décris le mouvement/l'animation que tu veux voir.");
      return;
    }
    if (!session) {
      setVideoError("Connecte-toi d'abord.");
      return;
    }

    setVideoUrl(null);
    const controller = new AbortController();
    videoAbortControllerRef.current = controller;
    setVideoLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("description", videoDescription.trim());
      formData.append("format", videoFormat);

      const res = await fetch("/api/animate", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
        signal: controller.signal,
      });

      let data: { video?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        setVideoError(
          "Le serveur a mis trop de temps à répondre ou a coupé la connexion. Réessaie."
        );
        return;
      }

      if (!res.ok || !data.video) {
        setVideoError(data.error ?? "Erreur pendant la génération vidéo.");
        return;
      }
      setVideoUrl(data.video);

      // Une vidéo débite de vrais crédits (voir app/api/animate/route.ts) —
      // resynchronise le solde affiché, comme après une génération image.
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
        setVideoError("Impossible de contacter le serveur.");
      }
    } finally {
      setVideoLoading(false);
      videoAbortControllerRef.current = null;
    }
  }

  function handleCancelVideoGenerate() {
    videoAbortControllerRef.current?.abort();
  }

  // A plain <a href download> silently fails here — videoUrl is a signed
  // Supabase Storage URL on a different origin than the site, and browsers
  // ignore `download` for cross-origin links, just navigating to the file
  // instead of saving it (see lib/download.ts).
  async function handleDownloadVideo() {
    if (!videoUrl) return;
    setDownloadingVideo(true);
    try {
      await downloadFile(videoUrl, "video.mp4");
    } catch {
      setVideoError("Le téléchargement a échoué. Réessaie.");
    } finally {
      setDownloadingVideo(false);
    }
  }

  // Owner-only test-credit top-up (see app/api/admin/grant-test-credits/
  // route.ts) — the owner's image generations always bypass the credits
  // balance, so it sits at 0 with no way to fund it for testing video's
  // real credit-debit flow short of an actual Stripe purchase.
  async function handleGrantTestCredits() {
    if (!session) return;
    setVideoError(null);
    setGrantingCredits(true);
    try {
      const res = await fetch("/api/admin/grant-test-credits", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setVideoError(data.error ?? "Erreur pendant l'ajout de crédits.");
        return;
      }
      const supabase = getSupabaseBrowser();
      const { data: fresh } = await supabase!
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (fresh) setProfile(fresh as Profile);
    } catch {
      setVideoError("Impossible de contacter le serveur.");
    } finally {
      setGrantingCredits(false);
    }
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

      <div className="mt-4 inline-flex overflow-hidden rounded-full border border-zinc-700 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setMode("image")}
          className={`px-4 py-1.5 transition ${
            mode === "image" ? "bg-emerald-400 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          🖼️ Image
        </button>
        <button
          type="button"
          onClick={() => setMode("video")}
          className={`px-4 py-1.5 transition ${
            mode === "video" ? "bg-emerald-400 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          🎬 Vidéo
        </button>
      </div>

      {mode === "image" && hasFreeTrialAvailable && (
        <p className="mt-3 rounded-lg border border-emerald-800/40 bg-emerald-400/5 px-4 py-2 text-sm text-emerald-300">
          🎁 Ton essai gratuit — un vrai résultat, avec filigrane. Achète des
          crédits pour débloquer sans filigrane et continuer.
        </p>
      )}
      {mode === "image" && !hasFreeTrialAvailable && !isOwnerAccount && (
        <p className="mt-3 text-sm text-zinc-500">
          {creditsBalance} crédits disponibles ({Math.floor(creditsBalance / GENERATION_CREDIT_COST)} génération(s)).
        </p>
      )}
      {mode === "video" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-500">
            Nouveau — {VIDEO_CREDIT_COST} crédits par vidéo (4 secondes, 1080p,
            avec son, toujours au format paysage quelle que soit
            l&apos;orientation de ta photo). {creditsBalance} crédits
            disponibles ({Math.floor(creditsBalance / VIDEO_CREDIT_COST)} vidéo(s)).
          </p>
          {isOwnerAccount && (
            <button
              type="button"
              onClick={handleGrantTestCredits}
              disabled={grantingCredits}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              {grantingCredits ? "Ajout..." : "🧪 +3000 crédits de test"}
            </button>
          )}
        </div>
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

          {mode === "image" ? (
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
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-semibold text-zinc-300">
                  2. Décris le mouvement/l&apos;animation
                </label>
                <span className="text-xs text-zinc-500">
                  {videoDescription.length}/{DESCRIPTION_MAX}
                </span>
              </div>
              <textarea
                value={videoDescription}
                onChange={(e) => setVideoDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                rows={3}
                placeholder="Ex : la caméra tourne lentement autour de la voiture, reflets qui bougent sur la carrosserie"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {VIDEO_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setVideoDescription(ex)}
                    className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-white"
                  >
                    {ex.length > 40 ? ex.slice(0, 40) + "…" : ex}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-sm font-semibold text-zinc-300">
                  3. Format
                </label>
                <div className="inline-flex overflow-hidden rounded-full border border-zinc-700 text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => setVideoFormat("landscape")}
                    className={`px-4 py-1.5 transition ${
                      videoFormat === "landscape"
                        ? "bg-emerald-400 text-black"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    🖥️ Paysage
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoFormat("portrait")}
                    className={`px-4 py-1.5 transition ${
                      videoFormat === "portrait"
                        ? "bg-emerald-400 text-black"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    📱 Portrait (story)
                  </button>
                </div>
                {videoFormat === "portrait" && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Veo ne sait générer qu&apos;en paysage — le format portrait
                    recadre ce résultat après coup pour remplir un écran de
                    story, en perdant les bords gauche/droite de l&apos;image.
                  </p>
                )}
              </div>
            </div>
          )}

          {mode === "image" && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-300">
                3. Photo de référence du modèle exact (optionnel)
              </label>
              <p className="mb-2 text-xs text-zinc-500">
                Une vraie photo du logo/motif/design exact demandé (ex : une photo de la carte,
                de la montre) aide l&apos;IA à mieux le reproduire.
              </p>
              {referencePreviewUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={referencePreviewUrl}
                    alt="Référence"
                    className="h-16 w-16 rounded-lg border border-zinc-700 object-cover"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveReference}
                    className="text-xs font-semibold text-zinc-400 hover:text-white"
                  >
                    Retirer
                  </button>
                </div>
              ) : (
                <label className="inline-block cursor-pointer rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:border-zinc-500 hover:text-white">
                  + Ajouter une photo de référence
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReferenceFileChange}
                  />
                </label>
              )}
            </div>
          )}

          {mode === "image" ? (
            <>
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
                  Générer →{" "}
                  {hasFreeTrialAvailable
                    ? "essai gratuit"
                    : isOwnerAccount
                    ? "offert"
                    : `${GENERATION_CREDIT_COST} crédits`}
                </button>
              )}
            </>
          ) : (
            <>
              {videoError && <p className="text-sm text-red-400">{videoError}</p>}

              {videoLoading ? (
                <button
                  onClick={handleCancelVideoGenerate}
                  className="w-full rounded-full border border-red-500/60 px-6 py-3 font-bold text-red-400 transition hover:bg-red-500/10"
                >
                  Annuler
                </button>
              ) : (
                <button
                  onClick={handleGenerateVideo}
                  disabled={!file}
                  className="w-full rounded-full bg-emerald-400 px-6 py-3 font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Générer la vidéo → {VIDEO_CREDIT_COST} crédits
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {mode === "image" ? (
            <>
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
              {resultUrl && resultImperfect && !loading && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  ⚠️ Résultat imparfait : l&apos;IA n&apos;a pas totalement respecté ta photo ou le
                  changement demandé sur cette tentative. Essaie une description plus précise
                  (angle, couleur, modèle exact) ou une autre photo pour un meilleur rendu.
                </div>
              )}
              <div
                className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 ${
                  resultUrl ? "" : "aspect-video"
                }`}
                style={resultUrl && resultAspect ? { aspectRatio: resultAspect, maxHeight: "70vh" } : undefined}
              >
                {loading ? (
                  <GeneratingCard steps={IMAGE_GENERATION_STEPS} />
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
            </>
          ) : (
            <>
              <div
                className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 ${
                  videoUrl ? "" : "aspect-video"
                }`}
              >
                {videoLoading ? (
                  <GeneratingCard steps={VIDEO_GENERATION_STEPS} />
                ) : videoUrl ? (
                  <video src={videoUrl} controls autoPlay loop className="h-full w-full object-contain" />
                ) : previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Aperçu" className="h-full w-full object-contain opacity-40" />
                ) : (
                  <p className="px-6 text-center text-sm text-zinc-600">
                    La vidéo apparaîtra ici après génération.
                  </p>
                )}
              </div>
              {videoUrl && (
                <button
                  onClick={handleDownloadVideo}
                  disabled={downloadingVideo}
                  className="rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold text-white transition hover:border-zinc-400 disabled:opacity-60"
                >
                  {downloadingVideo ? "Téléchargement..." : "Télécharger la vidéo"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImpressPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto w-full max-w-6xl px-6 py-16 text-zinc-500">Chargement...</div>}
    >
      <ImpressPageInner />
    </Suspense>
  );
}
