"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CREDIT_PACKS, VIDEO_EDIT_CREDIT_COST } from "@/lib/presets";
import { getSupabaseBrowser, Profile } from "@/lib/supabase";
import { downloadFile } from "@/lib/download";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import GeneratingCard from "@/components/motion/GeneratingCard";

const DESCRIPTION_MAX = 1200;
const MIN_DURATION_SECONDS = 2;
const MAX_DURATION_SECONDS = 4;
const MAX_UPLOAD_MB = 16;

const EXAMPLES = [
  "Remplace ma voiture par une Lamborghini Huracán verte, même angle et lumière",
  "Change mes vêtements pour un costume noir élégant",
  "Transforme le décor en rue de nuit avec des néons",
];

// Narration affichée pendant la génération — même principe que
// IMAGE_GENERATION_STEPS/VIDEO_GENERATION_STEPS sur /impress (voir
// app/impress/page.tsx), adaptée au video-to-video (Runway Aleph 2.0) :
// l'IA part d'une vraie vidéo filmée, pas d'une simple photo, donc l'étape
// d'analyse porte sur le mouvement déjà présent plutôt qu'à générer.
const EDIT_VIDEO_STEPS = [
  "Analyse de ta vidéo...",
  "Détection du mouvement et de la caméra déjà filmés...",
  "Application du changement demandé, image par image...",
  "Vérification de la cohérence sur toute la durée du clip...",
  "Encodage final (peut prendre plusieurs minutes)...",
];

export default function EditVideoPage() {
  const { loading: authLoading, session } = useSupabaseUser();
  const loggedIn = Boolean(session);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [upgradeLoadingTier, setUpgradeLoadingTier] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  // Object URL for the locally-selected video file, revoked on change/unmount
  // to avoid leaking memory — same pattern as image previews elsewhere.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!videoFile) {
      setVideoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const creditsBalance = profile?.credits_balance ?? 0;
  const hasCredits = creditsBalance >= VIDEO_EDIT_CREDIT_COST;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setResultUrl(null);
    setVideoFile(f);
  }

  function handleRemoveVideo() {
    setVideoFile(null);
    setResultUrl(null);
  }

  async function refreshProfile() {
    if (!session) return;
    const supabase = getSupabaseBrowser();
    const { data: fresh } = await supabase!
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (fresh) setProfile(fresh as Profile);
  }

  // The actual transformation runs in the background on Replicate — a full
  // video-to-video edit routinely takes longer than any single HTTP request
  // can safely stay open for (confirmed in production: a blocking version
  // of this call crashed with a non-JSON "server took too long" response
  // once, even with a generous internal deadline). handleGenerate only
  // starts the job (fast); pollJobStatus checks in on it every few seconds
  // afterward, in a request of its own each time, so no single request's
  // duration is ever a bottleneck. Gives up after MAX_POLLS as a safety net
  // in case a job somehow never reaches a terminal state.
  const POLL_INTERVAL_MS = 4000;
  const MAX_POLLS = 180; // ~12 minutes
  const activeJobRef = useRef<{ predictionId: string; reservation: string; path: string } | null>(
    null
  );
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function pollJobStatus(
    predictionId: string,
    reservation: string,
    path: string,
    pollCount: number
  ) {
    if (!session) return;
    // A newer job (or a cancel) superseded this poll loop — stop silently.
    if (activeJobRef.current?.predictionId !== predictionId) return;

    if (pollCount > MAX_POLLS) {
      setError("La transformation prend anormalement longtemps. Réessaie plus tard.");
      setLoading(false);
      activeJobRef.current = null;
      await refreshProfile();
      return;
    }

    try {
      const res = await fetch(
        `/api/edit-video/status?id=${encodeURIComponent(predictionId)}&reservation=${encodeURIComponent(
          reservation
        )}&path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const data: { status?: string; video?: string; error?: string } = await res.json();

      if (activeJobRef.current?.predictionId !== predictionId) return;

      if (data.status === "processing") {
        pollTimeoutRef.current = setTimeout(
          () => pollJobStatus(predictionId, reservation, path, pollCount + 1),
          POLL_INTERVAL_MS
        );
        return;
      }

      if (data.status === "done" && data.video) {
        setResultUrl(data.video);
        setLoading(false);
        activeJobRef.current = null;
        await refreshProfile();
        return;
      }

      setError(data.error ?? "Erreur pendant la transformation vidéo.");
      setLoading(false);
      activeJobRef.current = null;
      await refreshProfile();
    } catch {
      // A transient network error on one poll shouldn't abandon an
      // otherwise-healthy job — just try again on the next tick.
      pollTimeoutRef.current = setTimeout(
        () => pollJobStatus(predictionId, reservation, path, pollCount + 1),
        POLL_INTERVAL_MS
      );
    }
  }

  async function handleGenerate() {
    setError(null);
    if (!videoFile) {
      setError("Ajoute d'abord ta vidéo.");
      return;
    }
    if (!description.trim()) {
      setError("Décris le changement que tu veux voir sur ta vidéo.");
      return;
    }
    if (!session) {
      setError("Connecte-toi d'abord.");
      return;
    }

    setResultUrl(null);
    setLoading(true);
    try {
      // Uploaded straight to Supabase Storage, not through our own API
      // route — Vercel Functions hard-cap the request body they can
      // receive at 4.5MB, platform-level, which a phone-filmed video
      // routinely exceeds even at just a few seconds long. That's exactly
      // why every earlier version of this feature (blocking, then the
      // async start/poll rewrite) kept failing identically: the upload
      // itself was being rejected before any of our own code ever ran.
      const urlRes = await fetch("/api/edit-video/upload-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const urlData: { path?: string; token?: string; error?: string } = await urlRes.json();
      if (!urlRes.ok || !urlData.path || !urlData.token) {
        setError(urlData.error ?? "Impossible de préparer l'envoi de la vidéo.");
        setLoading(false);
        return;
      }

      const supabase = getSupabaseBrowser();
      const { error: uploadError } = await supabase!.storage
        .from("videos")
        .uploadToSignedUrl(urlData.path, urlData.token, videoFile);
      if (uploadError) {
        setError("L'envoi de la vidéo a échoué. Réessaie.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/edit-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ path: urlData.path, description: description.trim() }),
      });

      let data: { predictionId?: string; reservation?: string; path?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        setError(
          "Le serveur a mis trop de temps à répondre ou a coupé la connexion. Réessaie."
        );
        setLoading(false);
        return;
      }

      if (!res.ok || !data.predictionId || !data.reservation || !data.path) {
        setError(data.error ?? "Erreur pendant la transformation vidéo.");
        setLoading(false);
        return;
      }

      activeJobRef.current = {
        predictionId: data.predictionId,
        reservation: data.reservation,
        path: data.path,
      };
      pollJobStatus(data.predictionId, data.reservation, data.path, 0);
    } catch {
      setError("Impossible de contacter le serveur.");
      setLoading(false);
    }
  }

  function handleCancelGenerate() {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    const job = activeJobRef.current;
    activeJobRef.current = null;
    setLoading(false);
    if (job && session) {
      fetch(
        `/api/edit-video/status?id=${encodeURIComponent(job.predictionId)}&reservation=${encodeURIComponent(
          job.reservation
        )}&path=${encodeURIComponent(job.path)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } }
      )
        .catch(() => {})
        .finally(() => refreshProfile());
    }
  }

  async function handleDownload() {
    if (!resultUrl) return;
    setDownloading(true);
    try {
      await downloadFile(resultUrl, "video-transformee.mp4");
    } catch {
      setError("Le téléchargement a échoué. Réessaie.");
    } finally {
      setDownloading(false);
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

  if (authLoading || (loggedIn && !profile)) {
    return <div className="mx-auto w-full max-w-6xl px-6 py-16 text-zinc-500">Chargement...</div>;
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">🎥 Transformer ma vidéo</h1>
        <p className="mt-3 text-zinc-400">
          Connecte-toi pour transformer une vidéo que tu as filmée toi-même —
          en gardant ton mouvement réel, ton geste, ta caméra — pendant que
          l&apos;IA applique un changement précis dessus.
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

  if (!hasCredits) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-2xl font-extrabold">🎥 Transformer ma vidéo</h1>
          <p className="mt-3 text-zinc-400">
            Cette fonctionnalité n&apos;a pas d&apos;essai gratuit — le
            traitement d&apos;une vraie vidéo coûte nettement plus cher qu&apos;une
            image. Achète des crédits pour continuer (
            {VIDEO_EDIT_CREDIT_COST} crédits par transformation).
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
      <h1 className="text-3xl font-extrabold">🎥 Transformer ma vidéo</h1>
      <p className="mt-2 text-zinc-400">
        Filme-toi toi-même — un geste, une présentation à la main — et décris
        un changement précis. L&apos;IA garde ton mouvement réel et applique
        exactement ce changement, comme pour une vraie vidéo montée à la main.
      </p>
      <p className="mt-3 text-sm text-zinc-500">
        {creditsBalance} crédits disponibles (
        {Math.floor(creditsBalance / VIDEO_EDIT_CREDIT_COST)} transformation(s)).
      </p>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">
              1. Ta vidéo ({MIN_DURATION_SECONDS}-{MAX_DURATION_SECONDS} secondes,{" "}
              {MAX_UPLOAD_MB} Mo max)
            </label>
            {videoPreviewUrl ? (
              <div className="flex flex-col gap-2">
                <video
                  src={videoPreviewUrl}
                  controls
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50"
                />
                <button
                  type="button"
                  onClick={handleRemoveVideo}
                  className="w-fit text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Retirer
                </button>
              </div>
            ) : (
              <label className="flex aspect-video w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300">
                + Ajouter ma vidéo
                <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
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
              placeholder="Ex : remplace ma voiture par une Lamborghini Huracán verte, même angle, même lumière"
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
              disabled={!videoFile}
              className="w-full rounded-full bg-emerald-400 px-6 py-3 font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Transformer la vidéo → {VIDEO_EDIT_CREDIT_COST} crédits
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div
            className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 ${
              resultUrl ? "" : "aspect-video"
            }`}
          >
            {loading ? (
              <GeneratingCard steps={EDIT_VIDEO_STEPS} />
            ) : resultUrl ? (
              <video src={resultUrl} controls autoPlay loop className="h-full w-full object-contain" />
            ) : (
              <p className="px-6 text-center text-sm text-zinc-600">
                Le résultat apparaîtra ici après transformation.
              </p>
            )}
          </div>
          {resultUrl && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold text-white transition hover:border-zinc-400 disabled:opacity-60"
            >
              {downloading ? "Téléchargement..." : "Télécharger la vidéo"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
