"use client";

import { useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CREDIT_PACKS,
  GENERATION_CREDIT_COST,
  VIDEO_CREDIT_COST,
  VIDEO_EDIT_CREDIT_COST_PER_SECOND,
  MIN_EDIT_VIDEO_SECONDS,
  MAX_EDIT_VIDEO_SECONDS,
  getVideoEditCreditCost,
} from "@/lib/presets";
import { getSupabaseBrowser, Profile } from "@/lib/supabase";
import { downloadFile } from "@/lib/download";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import { useEffect } from "react";
import GeneratingCard from "@/components/motion/GeneratingCard";
import ResultReveal from "@/components/motion/ResultReveal";
import { compressImageFile } from "@/lib/compress-image";

// Kept in sync with MAX_DESCRIPTION in app/api/impress/route.ts — raised
// from 400 since a precise brand-fidelity description (exact wordmark
// spelling, emblem placement, paddle shifters, drive-mode selector
// labels...) routinely needs more room than that.
const DESCRIPTION_MAX = 1200;
const EXAMPLES = [
  "Remplace ma voiture par une Porsche 911 rouge, même angle, même lumière",
  "Remplace ma voiture par une Bugatti Chiron noire brillante, avec un reflet ultra réaliste et une finition/design premium, sans changer le fond, le décor ni la position de la voiture. Je te joins une image de référence pour le logo. Adapte les dimensions à celles de la vraie Bugatti Chiron.",
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
// Édition vidéo (Seedance 2.5, voir app/api/video-edit/route.ts) : on
// envoie une vidéo existante et on décrit un changement précis à y
// appliquer, plutôt qu'animer une simple photo — les exemples reflètent
// cette convention (référencer [Video1], dire quoi changer ET quoi garder,
// suivant la documentation officielle du modèle).
const VIDEO_EDIT_EXAMPLES = [
  "Remplace ma voiture dans [Video1] par une Ferrari 812 rouge, garde exactement le même mouvement de caméra",
  "Change le fond derrière moi dans [Video1] par un décor de plage au coucher du soleil, garde mon mouvement identique",
  "Change la couleur de ma voiture dans [Video1] en noir mat, garde tout le reste identique",
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
  "Génération de la vidéo (Seedance 2.5)...",
  "Synchronisation du son...",
  "Encodage final en 720p (peut prendre plusieurs minutes)...",
];
const VIDEO_EDIT_GENERATION_STEPS = [
  "Analyse de ta vidéo...",
  "Détection du mouvement de caméra et du décor à préserver...",
  "Application du changement demandé (Seedance 2.5)...",
  "Synchronisation du son...",
  "Encodage final en 720p (peut prendre plusieurs minutes)...",
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
  // Result images are now (see app/api/impress/route.ts) a signed Storage
  // URL rather than a data: URI, same reasoning as videoUrl below — a plain
  // <a download> only works for a same-origin/data: URI, not a cross-origin
  // signed URL, so downloads go through the same fetch-into-blob helper.
  const [downloadingImage, setDownloadingImage] = useState(false);
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
  const [mode, setMode] = useState<"image" | "video" | "video-edit">(() =>
    searchParams.get("mode") === "video"
      ? "video"
      : searchParams.get("mode") === "video-edit"
      ? "video-edit"
      : "image"
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

  // Édition vidéo (Seedance 2.5, voir app/api/video-edit/route.ts) : envoie
  // une vidéo EXISTANTE, pas une photo — entrée totalement séparée du reste
  // du formulaire (state `file`/`previewUrl` ci-dessus), avec sa propre
  // prévisualisation, description, statut de chargement/erreur et résultat.
  const [editVideoFile, setEditVideoFile] = useState<File | null>(null);
  const [editVideoPreviewUrl, setEditVideoPreviewUrl] = useState<string | null>(null);
  // Read client-side (the browser already has to load the file's metadata
  // to show a preview) so the exact price — proportional to the real
  // duration, not a flat fee, see lib/presets.ts's getVideoEditCreditCost —
  // can be shown before the user even clicks generate, instead of only
  // finding out the cost after the server measures it too.
  const [editVideoDurationSeconds, setEditVideoDurationSeconds] = useState<number | null>(null);
  const [editVideoDescription, setEditVideoDescription] = useState("");
  const [editVideoLoading, setEditVideoLoading] = useState(false);
  const [editVideoError, setEditVideoError] = useState<string | null>(null);
  const [editVideoResultUrl, setEditVideoResultUrl] = useState<string | null>(null);
  const [downloadingEditVideo, setDownloadingEditVideo] = useState(false);
  const editVideoAbortControllerRef = useRef<AbortController | null>(null);
  // Holds the current Replicate prediction id so "Annuler" can tell the
  // server which job to actually cancel (and refund) — see
  // handleCancelVideoEditGenerate below and app/api/video-edit/status/
  // route.ts's DELETE handler.
  const editVideoPredictionIdRef = useRef<string | null>(null);

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setResultUrl(null);
    setResultAspect(null);
    setPreviewAspect(null);
    setVideoError(null);
    setVideoUrl(null);
    // Downscaled/re-encoded client-side before it ever reaches setFile —
    // see lib/compress-image.ts for why (an uncompressed phone photo on a
    // weak connection can, on its own, eat the whole upload+generation
    // time budget).
    const compressed = await compressImageFile(f);
    setFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(compressed);
  }

  // No client-side compression here (unlike handleFileChange for photos) —
  // compressImageFile only handles images, and there's no equivalent
  // client-side video re-encode in this codebase. The server (app/api/
  // video-edit/route.ts) enforces the real limits (50 Mo sanity ceiling,
  // 4s max duration) instead.
  function handleEditVideoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setEditVideoError(null);
    setEditVideoResultUrl(null);
    setEditVideoFile(f);
    setEditVideoDurationSeconds(null);
    if (editVideoPreviewUrl) URL.revokeObjectURL(editVideoPreviewUrl);
    const url = URL.createObjectURL(f);
    setEditVideoPreviewUrl(url);

    // A detached <video> (never attached to the DOM) is enough to read
    // `duration` off its metadata — cheaper than waiting for the visible
    // preview element to load, and works even before it renders.
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration)) {
        setEditVideoDurationSeconds(probe.duration);
      }
    };
    probe.src = url;
  }

  async function handleReferenceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const compressed = await compressImageFile(f);
    setReferenceFile(compressed);
    const reader = new FileReader();
    reader.onload = () => setReferencePreviewUrl(reader.result as string);
    reader.readAsDataURL(compressed);
  }

  function handleRemoveReference() {
    setReferenceFile(null);
    setReferencePreviewUrl(null);
  }

  // Recovers a result whose generation actually finished server-side even
  // though the triggering request's own response never made it back to
  // this tab — the exact failure a flaky mobile connection produces on a
  // long-held request, indistinguishable client-side from the generation
  // itself having failed. app/api/impress/route.ts writes the finished
  // image to Storage under this same jobId regardless of whether anyone is
  // still listening for its response, so polling for that file recovers an
  // already-successful (and already-paid-for) generation instead of
  // discarding it. Bounded to roughly the server's own worst case
  // (GENERATION_DEADLINE_MS + margin) rather than polling forever; returns
  // null if that budget runs out or the poll is cancelled (Annuler).
  async function pollForImpressResult(
    jobId: string,
    signal: AbortSignal
  ): Promise<{ image: string } | null> {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      if (signal.aborted) return null;
      try {
        const res = await fetch(`/api/impress/status?jobId=${jobId}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          signal,
        });
        if (res.ok) {
          const data: { status?: string; image?: string } = await res.json();
          if (data.status === "done" && data.image) return { image: data.image };
        }
      } catch {
        // Transient poll failure (same flaky connection) — just try again
        // next tick rather than giving up on the first blip.
      }
    }
    return null;
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

    // Generated client-side so it's known even if the POST below never
    // gets a response back — see pollForImpressResult above.
    const jobId = crypto.randomUUID();

    async function applySuccess(image: string, imperfect: boolean) {
      setResultUrl(image);
      setResultWasTrial(usingTrial);
      setResultImperfect(imperfect);
      setShowOriginal(false);

      // Refresh the profile so free_generations_used/credits_balance
      // reflect what was just spent — otherwise the free banner or credit
      // count would stay stale until a full page reload.
      if (session) {
        const supabase = getSupabaseBrowser();
        const { data: fresh } = await supabase!
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (fresh) setProfile(fresh as Profile);
      }
    }

    // Recovery polling is only attempted below when the request had
    // clearly been running for a while first — an instant failure (no
    // network at all, DNS failure, offline) is almost never "the
    // generation actually finished, just the response got lost", and
    // making that case wait out a multi-minute poll budget before showing
    // an error would be a real regression for the ordinary "no signal"
    // case. 15s comfortably clears normal request setup time.
    const startedAt = Date.now();
    const worthPolling = () => Date.now() - startedAt > 15_000;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("description", description.trim());
      formData.append("jobId", jobId);
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
        // something in front of it (Vercel, a proxy, or the phone's own
        // connection) cut the response short. That doesn't necessarily
        // mean the generation itself failed, so check for a recovered
        // result before reporting a timeout.
        const recovered = worthPolling()
          ? await pollForImpressResult(jobId, controller.signal)
          : null;
        if (recovered) {
          await applySuccess(recovered.image, false);
          return;
        }
        setError(
          "Le serveur a mis trop de temps à répondre ou a coupé la connexion. Réessaie avec une photo plus légère ou une description plus courte."
        );
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Erreur pendant la retouche.");
        return;
      }
      await applySuccess(data.image ?? "", Boolean(data.imperfect));
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
        // A genuine fetch-level failure (connection dropped entirely, not
        // just a truncated response) is the same recoverable situation as
        // the JSON-parse failure above — see worthPolling above for why
        // this is gated on the request having run a while first.
        const recovered = worthPolling()
          ? await pollForImpressResult(jobId, controller.signal)
          : null;
        if (recovered) {
          await applySuccess(recovered.image, false);
        } else {
          setError("Impossible de contacter le serveur. Réessaie.");
        }
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleCancelGenerate() {
    abortControllerRef.current?.abort();
  }

  // See the downloadingImage comment above — resultUrl is a cross-origin
  // signed URL now, so a plain <a download> would just navigate to it
  // instead of saving it.
  async function handleDownloadImage() {
    if (!resultUrl) return;
    setDownloadingImage(true);
    try {
      await downloadFile(resultUrl, "impression.png");
    } catch {
      setError("Le téléchargement a échoué. Réessaie.");
    } finally {
      setDownloadingImage(false);
    }
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

  // Édition vidéo lance un job Replicate et le suit par polling séparé
  // (app/api/video-edit/route.ts starts it, status/route.ts is polled here)
  // instead of one blocking request — editing a whole existing video
  // reliably takes longer than this app's other AI calls, long enough to
  // outlast this project's real (lower than requested) Vercel function
  // duration ceiling, the same failure this session already root-caused
  // once for a similar feature. See lib/replicate-video.ts's
  // startVideoEdit comment for the full story.
  async function pollVideoEditStatus(
    predictionId: string,
    signal: AbortSignal
  ): Promise<
    { status: "done"; video: string } | { status: "failed"; error: string } | { status: "timeout" }
  > {
    // Generous relative to the image/animate polls — video editing has
    // shown no reason to be fast, and a real result (or a real refund) is
    // always better than giving up early.
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      if (signal.aborted) return { status: "timeout" };
      await new Promise((resolve) => setTimeout(resolve, 4000));
      if (signal.aborted) return { status: "timeout" };
      try {
        const res = await fetch(
          `/api/video-edit/status?predictionId=${encodeURIComponent(predictionId)}`,
          {
            headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
            signal,
          }
        );
        if (!res.ok) continue;
        const data: { status?: string; video?: string; error?: string } = await res.json();
        if (data.status === "done" && data.video) return { status: "done", video: data.video };
        if (data.status === "failed") {
          return { status: "failed", error: data.error ?? "Erreur pendant l'édition vidéo." };
        }
        // "processing" — keep polling.
      } catch {
        // Transient poll failure — try again next tick rather than giving
        // up on the first blip.
      }
    }
    return { status: "timeout" };
  }

  async function handleGenerateVideoEdit() {
    setEditVideoError(null);
    if (!editVideoFile) {
      setEditVideoError("Ajoute d'abord une vidéo.");
      return;
    }
    if (!editVideoDescription.trim()) {
      setEditVideoError("Décris le changement que tu veux voir dans la vidéo.");
      return;
    }
    if (!session) {
      setEditVideoError("Connecte-toi d'abord.");
      return;
    }

    setEditVideoResultUrl(null);
    const controller = new AbortController();
    editVideoAbortControllerRef.current = controller;
    setEditVideoLoading(true);
    try {
      // The video file never goes through our own /api/video-edit request
      // body — Vercel's serverless functions hard-cap inbound request size
      // at a few MB, well under what even a 4-6s phone clip weighs, and a
      // live test confirmed hitting exactly that ceiling (a silent,
      // generic "server took too long" failure with no way to tell it
      // apart from any other timeout). Uploading straight to Supabase
      // Storage from the browser bypasses our server for the large binary
      // entirely; only the resulting storage path (a few bytes) goes to
      // /api/video-edit afterward. See app/api/video-edit/upload-url/
      // route.ts for the full story.
      const uploadUrlRes = await fetch("/api/video-edit/upload-url", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      });
      const uploadUrlData: { path?: string; token?: string; error?: string } =
        await uploadUrlRes.json();
      if (!uploadUrlRes.ok || !uploadUrlData.path || !uploadUrlData.token) {
        setEditVideoError(uploadUrlData.error ?? "Erreur pendant la préparation de l'upload.");
        return;
      }

      const supabase = getSupabaseBrowser();
      const { error: uploadError } = await supabase!.storage
        .from("videos")
        .uploadToSignedUrl(uploadUrlData.path, uploadUrlData.token, editVideoFile);
      if (uploadError) {
        setEditVideoError("L'envoi de la vidéo a échoué. Réessaie.");
        return;
      }

      const res = await fetch("/api/video-edit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storagePath: uploadUrlData.path,
          description: editVideoDescription.trim(),
        }),
        signal: controller.signal,
      });

      let data: { predictionId?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        setEditVideoError(
          "Le serveur a mis trop de temps à répondre ou a coupé la connexion. Réessaie."
        );
        return;
      }

      if (!res.ok || !data.predictionId) {
        setEditVideoError(data.error ?? "Erreur pendant l'édition vidéo.");
        return;
      }

      editVideoPredictionIdRef.current = data.predictionId;
      const result = await pollVideoEditStatus(data.predictionId, controller.signal);

      if (!controller.signal.aborted) {
        if (result.status === "done") {
          setEditVideoResultUrl(result.video);
        } else if (result.status === "failed") {
          setEditVideoError(result.error);
        } else {
          setEditVideoError(
            "L'édition prend plus de temps que prévu. Si elle finit par échouer, tes crédits seront remboursés automatiquement."
          );
        }
      }

      if (session) {
        const supabase = getSupabaseBrowser();
        const { data: fresh } = await supabase!
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (fresh) setProfile(fresh as Profile);
      }
    } catch {
      setEditVideoError("Impossible de contacter le serveur.");
    } finally {
      setEditVideoLoading(false);
      editVideoAbortControllerRef.current = null;
      editVideoPredictionIdRef.current = null;
    }
  }

  function handleCancelVideoEditGenerate() {
    const predictionId = editVideoPredictionIdRef.current;
    editVideoAbortControllerRef.current?.abort();
    // Fire-and-forget: stops the actual Replicate job and refunds the
    // reservation server-side (app/api/video-edit/status/route.ts's DELETE
    // handler) — walking away client-side alone would leave the job
    // running and billing for nothing credited back.
    if (predictionId && session) {
      fetch(`/api/video-edit/status?predictionId=${encodeURIComponent(predictionId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
      setTimeout(async () => {
        const supabase = getSupabaseBrowser();
        const { data: fresh } = await supabase!
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (fresh) setProfile(fresh as Profile);
      }, 1500);
    }
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

  async function handleDownloadEditVideo() {
    if (!editVideoResultUrl) return;
    setDownloadingEditVideo(true);
    try {
      await downloadFile(editVideoResultUrl, "video-editee.mp4");
    } catch {
      setEditVideoError("Le téléchargement a échoué. Réessaie.");
    } finally {
      setDownloadingEditVideo(false);
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
        <button
          type="button"
          onClick={() => setMode("video-edit")}
          className={`px-4 py-1.5 transition ${
            mode === "video-edit" ? "bg-emerald-400 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          ✂️ Éditer vidéo
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
            Nouveau — {VIDEO_CREDIT_COST} crédits par vidéo (4 secondes, 720p,
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
      {mode === "video-edit" && (
        <p className="mt-3 text-sm text-zinc-500">
          Nouveau — modifie une vidéo que tu as déjà (change un objet, un
          décor, une couleur) en gardant le mouvement de caméra d&apos;origine.
          Entre {MIN_EDIT_VIDEO_SECONDS} et {MAX_EDIT_VIDEO_SECONDS} secondes,{" "}
          {VIDEO_EDIT_CREDIT_COST_PER_SECOND} crédits par seconde de vidéo (
          {getVideoEditCreditCost(MIN_EDIT_VIDEO_SECONDS)} à{" "}
          {getVideoEditCreditCost(MAX_EDIT_VIDEO_SECONDS)} crédits selon la
          durée). {creditsBalance} crédits disponibles.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          {mode === "video-edit" ? (
            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-300">
                1. Ta vidéo (entre {MIN_EDIT_VIDEO_SECONDS} et {MAX_EDIT_VIDEO_SECONDS} secondes)
              </label>
              {editVideoDurationSeconds !== null && (
                <p
                  className={`mb-2 text-xs ${
                    editVideoDurationSeconds >= MIN_EDIT_VIDEO_SECONDS &&
                    editVideoDurationSeconds <= MAX_EDIT_VIDEO_SECONDS
                      ? "text-zinc-500"
                      : "text-amber-400"
                  }`}
                >
                  Durée détectée : {editVideoDurationSeconds.toFixed(1)}s
                  {editVideoDurationSeconds >= MIN_EDIT_VIDEO_SECONDS &&
                  editVideoDurationSeconds <= MAX_EDIT_VIDEO_SECONDS
                    ? ` — coûtera ${getVideoEditCreditCost(editVideoDurationSeconds)} crédits`
                    : ` — hors limite (entre ${MIN_EDIT_VIDEO_SECONDS} et ${MAX_EDIT_VIDEO_SECONDS}s), recadre ta vidéo`}
                </p>
              )}
              <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950">
                {editVideoPreviewUrl ? (
                  <video
                    src={editVideoPreviewUrl}
                    controls
                    loop
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-zinc-400 transition hover:border-zinc-500">
                    <span className="text-3xl">🎬</span>
                    <span className="mt-2 text-sm">Clique pour choisir une vidéo</span>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleEditVideoFileChange}
                    />
                  </label>
                )}
              </div>
              {editVideoPreviewUrl && (
                <label className="mt-2 inline-block cursor-pointer text-xs font-semibold text-zinc-400 hover:text-white">
                  Changer de vidéo
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleEditVideoFileChange}
                  />
                </label>
              )}
            </div>
          ) : (
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
          )}

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
          ) : mode === "video" ? (
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
                    remplit un écran de story en gardant l&apos;intégralité de
                    l&apos;image (rien n&apos;est coupé), avec un fond flouté
                    en haut et en bas.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-semibold text-zinc-300">
                  2. Décris le changement à apporter à la vidéo
                </label>
                <span className="text-xs text-zinc-500">
                  {editVideoDescription.length}/{DESCRIPTION_MAX}
                </span>
              </div>
              <textarea
                value={editVideoDescription}
                onChange={(e) => setEditVideoDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                rows={3}
                placeholder="Ex : remplace ma voiture dans [Video1] par une Ferrari rouge, garde exactement le même mouvement"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {VIDEO_EDIT_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setEditVideoDescription(ex)}
                    className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-white"
                  >
                    {ex.length > 40 ? ex.slice(0, 40) + "…" : ex}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Décris à la fois ce qui doit changer et ce qui doit rester
                identique — le modèle garde le mouvement de caméra et le
                décor d&apos;origine, seul le point que tu précises est
                modifié.
              </p>
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
          ) : mode === "video" ? (
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
          ) : (
            <>
              {editVideoError && <p className="text-sm text-red-400">{editVideoError}</p>}

              {editVideoLoading ? (
                <button
                  onClick={handleCancelVideoEditGenerate}
                  className="w-full rounded-full border border-red-500/60 px-6 py-3 font-bold text-red-400 transition hover:bg-red-500/10"
                >
                  Annuler
                </button>
              ) : (
                <button
                  onClick={handleGenerateVideoEdit}
                  disabled={!editVideoFile}
                  className="w-full rounded-full bg-emerald-400 px-6 py-3 font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Éditer la vidéo →{" "}
                  {editVideoDurationSeconds !== null
                    ? `${getVideoEditCreditCost(editVideoDurationSeconds)} crédits`
                    : `${getVideoEditCreditCost(MIN_EDIT_VIDEO_SECONDS)}-${getVideoEditCreditCost(
                        MAX_EDIT_VIDEO_SECONDS
                      )} crédits`}
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
                <button
                  onClick={handleDownloadImage}
                  disabled={downloadingImage}
                  className="rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold text-white transition hover:border-zinc-400 disabled:opacity-60"
                >
                  {downloadingImage ? "Téléchargement..." : "Télécharger"}
                </button>
              ) : (
                <Link
                  href="/pricing"
                  className="rounded-full bg-emerald-400 px-6 py-3 text-center font-bold text-black transition hover:bg-emerald-300"
                >
                  Passe sur un plan pour télécharger sans filigrane
                </Link>
              ))}
            </>
          ) : mode === "video" ? (
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
          ) : (
            <>
              <div
                className={`relative flex w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 ${
                  editVideoResultUrl ? "" : "aspect-video"
                }`}
              >
                {editVideoLoading ? (
                  <GeneratingCard steps={VIDEO_EDIT_GENERATION_STEPS} />
                ) : editVideoResultUrl ? (
                  <video
                    src={editVideoResultUrl}
                    controls
                    autoPlay
                    loop
                    className="h-full w-full object-contain"
                  />
                ) : editVideoPreviewUrl ? (
                  <video
                    src={editVideoPreviewUrl}
                    muted
                    loop
                    className="h-full w-full object-contain opacity-40"
                  />
                ) : (
                  <p className="px-6 text-center text-sm text-zinc-600">
                    La vidéo éditée apparaîtra ici après génération.
                  </p>
                )}
              </div>
              {editVideoResultUrl && (
                <button
                  onClick={handleDownloadEditVideo}
                  disabled={downloadingEditVideo}
                  className="rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold text-white transition hover:border-zinc-400 disabled:opacity-60"
                >
                  {downloadingEditVideo ? "Téléchargement..." : "Télécharger la vidéo"}
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
