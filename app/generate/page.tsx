"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PRESETS,
  PLAN_AI_CAPS,
  PaidPlan,
  FACE_ZONE_BASE_RX,
  FACE_ZONE_BASE_RY,
  EDIT_ZONE_BASE_RX,
  EDIT_ZONE_BASE_RY,
  PresetId,
  getPreset,
} from "@/lib/presets";
import { getSupabaseBrowser, Profile } from "@/lib/supabase";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

const AI_DESCRIPTION_MAX = 3000;
const EDIT_INSTRUCTION_MAX = 300;
const MAX_TEXT_LAYERS = 5;
const MAX_SHAPES = 8;
const MAX_REFERENCE_IMAGES = 3;

type Plan = "free" | PaidPlan;
type BackgroundStyle = "panel" | "shadow" | "none";
type ShapeType = "arrow" | "circle" | "rectangle";

interface TextLayerState {
  id: string;
  text: string;
  color: string;
  strokeColor: string;
  backgroundStyle: BackgroundStyle;
  x: number;
  y: number;
  curve: number;
  fontSize: number;
}

interface ShapeState {
  id: string;
  type: ShapeType;
  color: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

interface ReferenceImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface FacePreserveState {
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
}

const DEFAULT_FACE_PRESERVE: FacePreserveState = { x: 0.5, y: 0.38, sizeX: 1, sizeY: 1 };

interface EditZoneState {
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
}

const DEFAULT_EDIT_ZONE: EditZoneState = { x: 0.72, y: 0.5, sizeX: 1, sizeY: 1 };

const BOX_ASPECT = 16 / 9;

// The preview box is a fixed 16:9 (aspect-video) rectangle, but the uploaded
// photo can be any aspect ratio and is shown inside it with object-contain —
// i.e. letterboxed. The face-zone marker must be positioned relative to the
// actual photo pixels (that's what the server masks), not the 16:9 box, so
// these two helpers convert between "fraction of the box" (what pointer
// events give us) and "fraction of the real photo" (what we send the API).
function letterboxFractions(imgAspect: number) {
  if (imgAspect > BOX_ASPECT) {
    const visH = BOX_ASPECT / imgAspect;
    return { visW: 1, visH, offX: 0, offY: (1 - visH) / 2 };
  }
  const visW = imgAspect / BOX_ASPECT;
  return { visW, visH: 1, offX: (1 - visW) / 2, offY: 0 };
}

function boxFractionToImageFraction(bx: number, by: number, imgAspect: number) {
  const { visW, visH, offX, offY } = letterboxFractions(imgAspect);
  return {
    x: Math.min(1, Math.max(0, (bx - offX) / visW)),
    y: Math.min(1, Math.max(0, (by - offY) / visH)),
  };
}

function imageFractionToBoxFraction(ix: number, iy: number, imgAspect: number) {
  const { visW, visH, offX, offY } = letterboxFractions(imgAspect);
  return { bx: offX + ix * visW, by: offY + iy * visH };
}

function fileFingerprint(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// 1x1 transparent PNG. When a cached AI base image is reused, the server
// never reads the original "image" field (it rebuilds everything from the
// cached base) — but a file must still be sent to pass validation. Sending
// the real, full-size photo again on top of the already-generated base
// image can push the request past Vercel's body size limit and make the
// whole call fail with a generic network error, so send this tiny
// placeholder instead in that case.
const TINY_PLACEHOLDER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const BACKGROUND_STYLE_OPTIONS: { id: BackgroundStyle; label: string }[] = [
  { id: "panel", label: "Panneau" },
  { id: "shadow", label: "Ombre" },
  { id: "none", label: "Aucun" },
];

const SHAPE_LABELS: Record<ShapeType, string> = {
  arrow: "Flèche",
  circle: "Cercle",
  rectangle: "Rectangle",
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function currentMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function makeTitleLayer(preset: ReturnType<typeof getPreset>): TextLayerState {
  return {
    id: uid(),
    text: "",
    color: preset.textColor,
    strokeColor: preset.strokeColor.length === 7 ? preset.strokeColor : "#000000",
    backgroundStyle: "panel",
    x: 0.5,
    y: 0.85,
    curve: 0,
    fontSize: 88,
  };
}

export default function GeneratePage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<PresetId>("bold-impact");
  const [intensity, setIntensity] = useState(100);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [fineBrightness, setFineBrightness] = useState(0);
  const [fineContrast, setFineContrast] = useState(0);
  const [fineSaturation, setFineSaturation] = useState(0);
  const [vignette, setVignette] = useState(false);
  const [border, setBorder] = useState(false);
  const [borderColor, setBorderColor] = useState("#FFE000");

  const [textLayers, setTextLayers] = useState<TextLayerState[]>(() => [
    makeTitleLayer(getPreset("bold-impact")),
  ]);
  const [shapes, setShapes] = useState<ShapeState[]>([]);

  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEnhance, setAiEnhance] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [facePreserve, setFacePreserve] = useState<FacePreserveState | null>(null);
  const [editZone, setEditZone] = useState<EditZoneState | null>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [naturalImgSize, setNaturalImgSize] = useState<{ w: number; h: number } | null>(null);
  const [aiBaseCache, setAiBaseCache] = useState<{ key: string; dataUrl: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: "text" | "shape" | "face" | "editzone"; id: string } | null>(null);

  const { loading: authLoading, session } = useSupabaseUser();
  const loggedIn = Boolean(session);

  async function refetchProfile() {
    const supabase = getSupabaseBrowser();
    if (!supabase || !session) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (data) setProfile(data as Profile);
  }

  // Vrai paywall : aucune génération sans compte connecté et abonné. Le plan
  // et le quota affichés viennent uniquement du profil Supabase réel — plus
  // de simulation locale pour les visiteurs non connectés.
  // TEMPORAIRE — accès Pro pour un test manuel, à retirer sur demande.
  // Ne modifie rien en base, juste ce qui est affiché dans ce navigateur.
  const TEMP_PRO_TEST_EMAILS = ["leane.lotellier@icloud.com", "mathis.ferry76@gmail.com"];
  const isTempProTest = Boolean(
    session?.user.email && TEMP_PRO_TEST_EMAILS.includes(session.user.email.toLowerCase())
  );
  const effectivePlan: Plan = isTempProTest ? "pro" : (profile?.plan ?? "free");
  const isPaid = effectivePlan !== "free";
  // Un seul essai gratuit par compte, réservé à l'IA — au-delà, un
  // abonnement est nécessaire (vérifié aussi côté serveur).
  const hasFreeTrialAvailable =
    !isPaid && (profile?.free_generations_used ?? 0) < 1;
  const aiCap = isPaid
    ? PLAN_AI_CAPS[effectivePlan as PaidPlan] + (profile?.bonus_generations ?? 0)
    : 0;
  const effectiveAiUsesThisMonth = profile
    ? profile.ai_uses_month_key === currentMonthId()
      ? profile.ai_uses_this_month
      : 0
    : 0;
  const aiLimitReached = isPaid && effectiveAiUsesThisMonth >= aiCap;
  const canUseAi = loggedIn && (isPaid ? !aiLimitReached : hasFreeTrialAvailable);
  const aiRemaining = Math.max(aiCap - effectiveAiUsesThisMonth, 0);

  // Once logged in, the account's real profile (plan + quota) takes over
  // from the localStorage simulation above. Right after a Stripe checkout
  // redirect the webhook may not have landed yet, so retry a few times.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const justUpgraded = params.get("success") === "true";

    (async () => {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      const attempts = justUpgraded ? 5 : 1;
      for (let i = 0; i < attempts; i++) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (cancelled) return;
        if (data) {
          setProfile(data as Profile);
          if (!justUpgraded || (data as Profile).plan !== "free") return;
        }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // As soon as AI mode is on and a photo is loaded, drop a sensible default
  // face zone so the mask protects something even if the user never touches
  // it — they can then drag/resize it for a perfect fit on off-center photos.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (canUseAi && aiEnhance && naturalImgSize && !facePreserve) {
      setFacePreserve(DEFAULT_FACE_PRESERVE);
    }
  }, [canUseAi, aiEnhance, naturalImgSize, facePreserve]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // The free trial is IA-only (no plain-filter freebie) — the server
  // rejects anything else, so force the toggle on and lock it instead of
  // letting the user uncheck it into a confusing 403.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isPaid && hasFreeTrialAvailable && !aiEnhance) {
      setAiEnhance(true);
    }
  }, [isPaid, hasFreeTrialAvailable, aiEnhance]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResultUrl(null);
    setError(null);
    setPreviewUrl(URL.createObjectURL(f));
    setNaturalImgSize(null);
    setFacePreserve(null);
    setEditZone(null);
    setEditInstruction("");
    setAiBaseCache(null);
  }

  function handleReferenceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setReferenceImages((prev) => {
      const room = MAX_REFERENCE_IMAGES - prev.length;
      const toAdd = files.slice(0, Math.max(0, room)).map((f) => ({
        id: uid(),
        file: f,
        previewUrl: URL.createObjectURL(f),
      }));
      return [...prev, ...toAdd];
    });
    e.target.value = "";
  }

  function removeReferenceImage(id: string) {
    setReferenceImages((prev) => prev.filter((r) => r.id !== id));
  }

  function selectPreset(id: PresetId) {
    setPresetId(id);
    const preset = getPreset(id);
    // Re-tint every layer to the new style's palette so switching style
    // gives a coherent starting point, same spirit as before for a single
    // title — now applied across however many layers exist.
    setTextLayers((prev) =>
      prev.map((layer) => ({
        ...layer,
        color: preset.textColor,
        strokeColor: preset.strokeColor.length === 7 ? preset.strokeColor : "#000000",
      }))
    );
  }

  function addTextLayer() {
    if (textLayers.length >= MAX_TEXT_LAYERS) return;
    const preset = getPreset(presetId);
    setTextLayers((prev) => [
      ...prev,
      {
        id: uid(),
        text: "",
        color: preset.textColor,
        strokeColor: preset.strokeColor.length === 7 ? preset.strokeColor : "#000000",
        backgroundStyle: "shadow",
        x: 0.5,
        y: 0.15,
        curve: 0,
        fontSize: 48,
      },
    ]);
  }

  function updateTextLayer(id: string, patch: Partial<TextLayerState>) {
    setTextLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeTextLayer(id: string) {
    setTextLayers((prev) => prev.filter((l) => l.id !== id));
  }

  function addShape(type: ShapeType) {
    if (shapes.length >= MAX_SHAPES) return;
    setShapes((prev) => [
      ...prev,
      { id: uid(), type, color: "#FFE000", x: 0.5, y: 0.5, size: 0.2, rotation: 0 },
    ]);
  }

  function updateShape(id: string, patch: Partial<ShapeState>) {
    setShapes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeShape(id: string) {
    setShapes((prev) => prev.filter((s) => s.id !== id));
  }

  function positionFromPointer(clientX: number, clientY: number) {
    const box = previewBoxRef.current;
    if (!box) return null;
    const rect = box.getBoundingClientRect();
    const x = Math.min(0.95, Math.max(0.05, (clientX - rect.left) / rect.width));
    const y = Math.min(0.95, Math.max(0.05, (clientY - rect.top) / rect.height));
    return { x, y };
  }

  function startDrag(kind: "text" | "shape", id: string) {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = { kind, id };
      (e.target as Element).setPointerCapture(e.pointerId);
      e.stopPropagation();
    };
  }

  function startFaceDrag(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { kind: "face", id: "face" };
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function startEditZoneDrag(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { kind: "editzone", id: "editzone" };
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function handlePreviewPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const active = dragRef.current;
    if (!active) return;

    if (active.kind === "face" || active.kind === "editzone") {
      const box = previewBoxRef.current;
      if (!box || !naturalImgSize) return;
      const rect = box.getBoundingClientRect();
      const bx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const by = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      const imgAspect = naturalImgSize.w / naturalImgSize.h;
      const pos = boxFractionToImageFraction(bx, by, imgAspect);
      if (active.kind === "face") {
        setFacePreserve((prev) => (prev ? { ...prev, ...pos } : prev));
      } else {
        setEditZone((prev) => (prev ? { ...prev, ...pos } : prev));
      }
      return;
    }

    const pos = positionFromPointer(e.clientX, e.clientY);
    if (!pos) return;
    if (active.kind === "text") {
      updateTextLayer(active.id, pos);
    } else {
      updateShape(active.id, pos);
    }
  }

  function handlePreviewPointerUp() {
    dragRef.current = null;
  }

  const hasAnyText = textLayers.some((l) => l.text.trim());

  // Identifies the inputs that actually change what OpenAI would generate.
  // As long as these stay the same, we can reuse the cached AI base and only
  // re-run the (free, instant) local compositing — new text, colors, shapes,
  // vignette, border. Change any of these and a fresh paid call is needed.
  function computeAiCacheKey(): string | null {
    if (!file) return null;
    return [
      fileFingerprint(file),
      presetId,
      aiDescription,
      referenceImages.map((r) => fileFingerprint(r.file)).join(","),
      JSON.stringify(facePreserve),
    ].join("|");
  }

  const willUseAi = canUseAi && aiEnhance;
  const currentAiCacheKey = willUseAi ? computeAiCacheKey() : null;
  const willReuseAiBase = Boolean(
    willUseAi && aiBaseCache && currentAiCacheKey && aiBaseCache.key === currentAiCacheKey
  );
  const willDoTargetedEdit = Boolean(willUseAi && editZone && editInstruction.trim());

  async function handleGenerate() {
    setError(null);

    if (!file) {
      setError("Ajoute d'abord une photo.");
      return;
    }
    if (!hasAnyText) {
      setError("Ajoute au moins un texte pour ta miniature.");
      return;
    }
    const cacheKey = willUseAi ? computeAiCacheKey() : null;
    const reuseCache = Boolean(
      willUseAi && aiBaseCache && cacheKey && aiBaseCache.key === cacheKey
    );

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append(
        "image",
        reuseCache ? await dataUrlToBlob(TINY_PLACEHOLDER_PNG) : file,
        reuseCache ? "placeholder.png" : file.name
      );
      formData.append("presetId", presetId);
      formData.append("aiEnhance", willUseAi ? "true" : "false");
      formData.append("aiDescription", aiDescription);
      formData.append("intensity", String(intensity));
      formData.append("fineBrightness", String(fineBrightness));
      formData.append("fineContrast", String(fineContrast));
      formData.append("fineSaturation", String(fineSaturation));
      formData.append("vignette", String(vignette));
      formData.append("border", String(border));
      formData.append("borderColor", borderColor);
      formData.append(
        "textLayers",
        JSON.stringify(textLayers.filter((l) => l.text.trim()))
      );
      formData.append("shapes", JSON.stringify(shapes));
      if (willUseAi) {
        if (reuseCache && aiBaseCache) {
          formData.append(
            "aiBaseImage",
            await dataUrlToBlob(aiBaseCache.dataUrl),
            "ai-base.png"
          );
        } else {
          for (const ref of referenceImages) {
            formData.append("referenceImages", ref.file);
          }
        }
        if (facePreserve) {
          formData.append("facePreserve", JSON.stringify(facePreserve));
        }
        if (editZone && editInstruction.trim()) {
          formData.append("editZone", JSON.stringify(editZone));
          formData.append("editInstruction", editInstruction.trim());
        }
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur pendant la génération.");
        return;
      }

      setResultUrl(data.image);
      setShowOriginal(false);
      if (typeof data.aiBase === "string" && cacheKey) {
        setAiBaseCache({ key: cacheKey, dataUrl: data.aiBase });
      }
      // A targeted edit was applied to the (now updated) cached base — clear
      // the instruction so the next click doesn't silently re-apply the same
      // edit again. The zone marker stays in case another tweak is wanted.
      if (editZone && editInstruction.trim()) {
        setEditInstruction("");
      }

      // The server already updated the real quota/history — just pull the
      // fresh numbers instead of guessing them locally.
      await refetchProfile();
    } catch {
      setError("Impossible de contacter le serveur. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  // Vrai paywall : pas de compte, ou compte sans abonnement actif -> on ne
  // montre même pas l'éditeur, juste l'invite à se connecter/s'abonner.
  if (authLoading || (loggedIn && !profile)) {
    return <div className="mx-auto w-full max-w-6xl px-6 py-16 text-zinc-500">Chargement...</div>;
  }

  if (!loggedIn) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">Créer une miniature</h1>
        <p className="mt-3 text-zinc-400">
          Connecte-toi puis choisis un plan pour créer ta première miniature.
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

  if (loggedIn && profile && !isPaid && !hasFreeTrialAvailable) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">Créer une miniature</h1>
        <p className="mt-3 text-zinc-400">
          Un abonnement est nécessaire pour créer des miniatures — choisis le
          plan qui te convient.
        </p>
        <Link
          href="/pricing"
          className="mt-6 rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300"
        >
          Voir les plans
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Créer une miniature</h1>
      <p className="mt-2 text-zinc-400">
        {isPaid &&
          `Plan ${
            effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1)
          } actif — miniatures illimitées, sans filigrane. Il te reste ${aiRemaining}/${aiCap} génération(s) IA ce mois-ci.`}
        {!isPaid && hasFreeTrialAvailable &&
          "🎁 Ton essai gratuit avec IA générative — avec filigrane, et le téléchargement HD nécessite un abonnement."}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">
              1. Ta photo — clique/glisse chaque élément pour le positionner
            </label>
            <div
              ref={previewBoxRef}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              className="relative aspect-video w-full touch-none overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950"
            >
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Aperçu"
                    onLoad={(e) =>
                      setNaturalImgSize({
                        w: e.currentTarget.naturalWidth,
                        h: e.currentTarget.naturalHeight,
                      })
                    }
                    className="pointer-events-none h-full w-full object-contain"
                  />
                  {canUseAi && aiEnhance && facePreserve && naturalImgSize && (() => {
                    const imgAspect = naturalImgSize.w / naturalImgSize.h;
                    const { bx, by } = imageFractionToBoxFraction(
                      facePreserve.x,
                      facePreserve.y,
                      imgAspect
                    );
                    const { visW, visH } = letterboxFractions(imgAspect);
                    const widthPct = 2 * FACE_ZONE_BASE_RX * facePreserve.sizeX * visW * 100;
                    const heightPct = 2 * FACE_ZONE_BASE_RY * facePreserve.sizeY * visH * 100;
                    return (
                      <div
                        onPointerDown={startFaceDrag}
                        className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-[50%] border-2 border-dashed border-emerald-400 bg-emerald-400/10"
                        style={{
                          left: `${bx * 100}%`,
                          top: `${by * 100}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                        }}
                      >
                        <span className="absolute top-full mt-1 whitespace-nowrap rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-black shadow-lg">
                          ✥ Visage à préserver
                        </span>
                      </div>
                    );
                  })()}
                  {canUseAi && aiEnhance && editZone && naturalImgSize && (() => {
                    const imgAspect = naturalImgSize.w / naturalImgSize.h;
                    const { bx, by } = imageFractionToBoxFraction(
                      editZone.x,
                      editZone.y,
                      imgAspect
                    );
                    const { visW, visH } = letterboxFractions(imgAspect);
                    const widthPct = 2 * EDIT_ZONE_BASE_RX * editZone.sizeX * visW * 100;
                    const heightPct = 2 * EDIT_ZONE_BASE_RY * editZone.sizeY * visH * 100;
                    return (
                      <div
                        onPointerDown={startEditZoneDrag}
                        className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-[50%] border-2 border-dashed border-orange-400 bg-orange-400/10"
                        style={{
                          left: `${bx * 100}%`,
                          top: `${by * 100}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                        }}
                      >
                        <span className="absolute top-full mt-1 whitespace-nowrap rounded-full bg-orange-400 px-2 py-0.5 text-[10px] font-bold text-black shadow-lg">
                          🎯 Zone à retoucher
                        </span>
                      </div>
                    );
                  })()}
                  {textLayers.map((layer, i) => (
                    <div
                      key={layer.id}
                      onPointerDown={startDrag("text", layer.id)}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-move items-center gap-1 rounded-full bg-yellow-400 px-2 py-1 text-[10px] font-bold text-black shadow-lg"
                      style={{ left: `${layer.x * 100}%`, top: `${layer.y * 100}%` }}
                    >
                      ✥ T{i + 1}
                    </div>
                  ))}
                  {shapes.map((shape) => (
                    <div
                      key={shape.id}
                      onPointerDown={startDrag("shape", shape.id)}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-move items-center gap-1 rounded-full bg-cyan-400 px-2 py-1 text-[10px] font-bold text-black shadow-lg"
                      style={{ left: `${shape.x * 100}%`, top: `${shape.y * 100}%` }}
                    >
                      ✥ {SHAPE_LABELS[shape.type][0]}
                    </div>
                  ))}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-full w-full flex-col items-center justify-center text-zinc-400 transition hover:border-zinc-500"
                >
                  <span className="text-3xl">📷</span>
                  <span className="mt-2 text-sm">Clique pour choisir une photo</span>
                </button>
              )}
            </div>
            {previewUrl && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-xs font-semibold text-zinc-400 hover:text-white"
              >
                Changer de photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">
              2. Style
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => selectPreset(preset.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    presetId === preset.id
                      ? "border-yellow-400 bg-yellow-400/10"
                      : "border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div
                    className="mb-2 h-10 w-full rounded"
                    style={{
                      background: `linear-gradient(135deg, ${preset.strokeColor}, ${preset.textColor})`,
                    }}
                  />
                  <div className="text-sm font-bold">{preset.name}</div>
                </button>
              ))}
            </div>

            <div className={`mt-4 ${canUseAi && aiEnhance ? "opacity-40" : ""}`}>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-300">
                  Intensité du filtre
                </label>
                <span className="text-xs text-zinc-500">{intensity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={intensity}
                disabled={canUseAi && aiEnhance}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="w-full accent-yellow-400 disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-3 text-xs font-semibold text-yellow-400 hover:underline"
            >
              {showAdvanced ? "▾" : "▸"} Réglages avancés (couleur, cadre)
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                {canUseAi && aiEnhance && (
                  <p className="text-xs text-zinc-500">
                    En mode IA, ces réglages s&apos;appliquent après coup sur le
                    résultat — utile pour calmer une IA qui est repartie sur des
                    couleurs trop criardes, sans relancer une génération.
                  </p>
                )}
                {[
                  { label: "Luminosité", value: fineBrightness, set: setFineBrightness },
                  { label: "Contraste", value: fineContrast, set: setFineContrast },
                  { label: "Saturation", value: fineSaturation, set: setFineSaturation },
                ].map((ctrl) => (
                  <div key={ctrl.label}>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs text-zinc-400">{ctrl.label}</label>
                      <span className="text-xs text-zinc-500">{ctrl.value}</span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      value={ctrl.value}
                      onChange={(e) => ctrl.set(Number(e.target.value))}
                      className="w-full accent-yellow-400 disabled:cursor-not-allowed"
                    />
                  </div>
                ))}

                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={vignette}
                    onChange={(e) => setVignette(e.target.checked)}
                    className="h-4 w-4 accent-yellow-400"
                  />
                  Vignette (assombrir les bords)
                </label>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={border}
                      onChange={(e) => setBorder(e.target.checked)}
                      className="h-4 w-4 accent-yellow-400"
                    />
                    Cadre bordure
                  </label>
                  {border && (
                    <input
                      type="color"
                      value={borderColor}
                      onChange={(e) => setBorderColor(e.target.value)}
                      className="h-6 w-10 cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-300">
                3. Textes ({textLayers.length}/{MAX_TEXT_LAYERS})
              </label>
              <button
                type="button"
                onClick={addTextLayer}
                disabled={textLayers.length >= MAX_TEXT_LAYERS}
                className="text-xs font-semibold text-yellow-400 hover:underline disabled:opacity-40"
              >
                + Ajouter un texte
              </button>
            </div>
            <div className="space-y-3">
              {textLayers.map((layer, i) => (
                <div
                  key={layer.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-400">
                      Texte {i + 1}
                    </span>
                    {textLayers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTextLayer(layer.id)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={layer.text}
                    onChange={(e) => updateTextLayer(layer.id, { text: e.target.value })}
                    maxLength={120}
                    placeholder={
                      i === 0
                        ? "J'AI TESTÉ ÇA PENDANT 30 JOURS"
                        : "Texte additionnel (sous-titre, badge...)"
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
                  />
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Couleur</label>
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) => updateTextLayer(layer.id, { color: e.target.value })}
                        className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Contour</label>
                      <input
                        type="color"
                        value={layer.strokeColor}
                        onChange={(e) =>
                          updateTextLayer(layer.id, { strokeColor: e.target.value })
                        }
                        className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-zinc-500">Fond</label>
                    <div className="grid grid-cols-3 gap-2">
                      {BACKGROUND_STYLE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => updateTextLayer(layer.id, { backgroundStyle: opt.id })}
                          className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                            layer.backgroundStyle === opt.id
                              ? "border-yellow-400 bg-yellow-400/10 text-white"
                              : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-xs text-zinc-500">Taille</label>
                        <span className="text-xs text-zinc-600">{layer.fontSize}</span>
                      </div>
                      <input
                        type="range"
                        min={28}
                        max={160}
                        value={layer.fontSize}
                        onChange={(e) =>
                          updateTextLayer(layer.id, { fontSize: Number(e.target.value) })
                        }
                        className="w-full accent-yellow-400"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="text-xs text-zinc-500">Courbure</label>
                        <span className="text-xs text-zinc-600">{layer.curve}</span>
                      </div>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        value={layer.curve}
                        onChange={(e) =>
                          updateTextLayer(layer.id, { curve: Number(e.target.value) })
                        }
                        className="w-full accent-yellow-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-zinc-300">
                4. Formes / annotations ({shapes.length}/{MAX_SHAPES})
              </label>
            </div>
            <div className="flex gap-2">
              {(Object.keys(SHAPE_LABELS) as ShapeType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addShape(type)}
                  disabled={shapes.length >= MAX_SHAPES}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-yellow-400 disabled:opacity-40"
                >
                  + {SHAPE_LABELS[type]}
                </button>
              ))}
            </div>
            {shapes.length > 0 && (
              <div className="mt-3 space-y-3">
                {shapes.map((shape) => (
                  <div
                    key={shape.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-400">
                        {SHAPE_LABELS[shape.type]}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeShape(shape.id)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-zinc-500">Couleur</label>
                        <input
                          type="color"
                          value={shape.color}
                          onChange={(e) => updateShape(shape.id, { color: e.target.value })}
                          className="h-8 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-xs text-zinc-500">Taille</label>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.6}
                          step={0.01}
                          value={shape.size}
                          onChange={(e) =>
                            updateShape(shape.id, { size: Number(e.target.value) })
                          }
                          className="w-full accent-yellow-400"
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-xs text-zinc-500">Rotation</label>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          value={shape.rotation}
                          onChange={(e) =>
                            updateShape(shape.id, { rotation: Number(e.target.value) })
                          }
                          className="w-full accent-yellow-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className={`rounded-xl border p-4 ${
              canUseAi
                ? "border-yellow-800/40 bg-yellow-400/5"
                : "border-zinc-800 bg-zinc-900/40"
            }`}
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={canUseAi && aiEnhance}
                disabled={!canUseAi || (!isPaid && hasFreeTrialAvailable)}
                onChange={(e) => setAiEnhance(e.target.checked)}
                className="mt-1 h-4 w-4 accent-yellow-400 disabled:opacity-40"
              />
              <span>
                <span className="block text-sm font-bold">✨ Amélioration IA générative</span>
                <span className="mt-1 block text-xs text-zinc-400">
                  {!isPaid && hasFreeTrialAvailable &&
                    "Ton essai gratuit — une vraie génération IA, avec filigrane. Le téléchargement HD nécessite un abonnement."}
                  {isPaid && !aiLimitReached &&
                    `Retravaille réellement l'éclairage et l'ambiance de ta photo avec une IA générative. Il te reste ${aiRemaining}/${aiCap} génération(s) IA ce mois-ci.`}
                  {isPaid && aiLimitReached &&
                    `Tu as utilisé tes ${aiCap} générations IA incluses ce mois-ci. Reviens le mois prochain, ou passe sur un plan supérieur pour plus de générations.`}
                </span>
                {aiLimitReached && (
                  <Link
                    href="/pricing"
                    className="mt-1 inline-block text-xs font-semibold text-yellow-400 hover:underline"
                  >
                    Voir les plans →
                  </Link>
                )}
              </span>
            </label>

            {canUseAi && aiEnhance && (
              <div className="mt-3 space-y-4 border-t border-yellow-800/30 pt-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Décris ce que tu veux voir (optionnel)
                    </label>
                    <span className="text-xs text-zinc-600">
                      {aiDescription.length}/{AI_DESCRIPTION_MAX}
                    </span>
                  </div>
                  <textarea
                    value={aiDescription}
                    onChange={(e) => setAiDescription(e.target.value)}
                    maxLength={AI_DESCRIPTION_MAX}
                    rows={5}
                    placeholder="Ex : je suis assis dans la cabine d'un jet privé, verre de champagne à la main, hublot avec un ciel bleu, lumière chaude et cinématographique, ambiance luxe premium — sois précis sur le décor, les objets et la mise en scène."
                    className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Le style {PRESETS.find((p) => p.id === presetId)?.name} donne déjà une
                    ambiance de base — plus tu décris précisément la scène (décor,
                    objets, action, lumière), plus le résultat se rapproche d&apos;une
                    vraie miniature mise en scène plutôt qu&apos;un simple filtre.
                  </p>
                </div>

                {facePreserve && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="block text-xs font-semibold text-zinc-300">
                        🔒 Zone visage à préserver
                      </label>
                      <button
                        type="button"
                        onClick={() => setFacePreserve(DEFAULT_FACE_PRESERVE)}
                        className="text-xs font-semibold text-zinc-500 hover:text-white"
                      >
                        Recentrer
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500">
                      Glisse le cercle vert sur l&apos;aperçu pour qu&apos;il recouvre
                      exactement ton visage. Cette zone est verrouillée pixel par
                      pixel — l&apos;IA ne peut littéralement pas la modifier, même
                      si elle change tout le reste de la photo. Prends le temps de
                      bien la positionner et de bien l&apos;ajuster en largeur et en
                      hauteur : c&apos;est ce qui garantit que tu restes
                      reconnaissable.
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-xs text-zinc-400">Largeur</label>
                          <span className="text-xs text-zinc-500">
                            {Math.round(facePreserve.sizeX * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={2}
                          step={0.05}
                          value={facePreserve.sizeX}
                          onChange={(e) =>
                            setFacePreserve((prev) =>
                              prev ? { ...prev, sizeX: Number(e.target.value) } : prev
                            )
                          }
                          className="w-full accent-emerald-400"
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-xs text-zinc-400">Hauteur</label>
                          <span className="text-xs text-zinc-500">
                            {Math.round(facePreserve.sizeY * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={2}
                          step={0.05}
                          value={facePreserve.sizeY}
                          onChange={(e) =>
                            setFacePreserve((prev) =>
                              prev ? { ...prev, sizeY: Number(e.target.value) } : prev
                            )
                          }
                          className="w-full accent-emerald-400"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-orange-800/40 bg-orange-400/5 p-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      🎯 Retouche ciblée (optionnel)
                    </label>
                    {editZone ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditZone(null);
                          setEditInstruction("");
                        }}
                        className="text-xs font-semibold text-zinc-500 hover:text-white"
                      >
                        Retirer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditZone(DEFAULT_EDIT_ZONE)}
                        className="text-xs font-semibold text-orange-400 hover:underline"
                      >
                        + Ajouter une zone
                      </button>
                    )}
                  </div>

                  {editZone ? (
                    <>
                      <p className="mt-1 text-xs text-zinc-500">
                        Glisse le cercle orange sur l&apos;élément à corriger
                        (couleurs trop vives, objet mal placé...) puis décris le
                        changement voulu. Seule cette zone sera retouchée par
                        l&apos;IA, le reste de la photo ne bouge pas.
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <label className="text-xs text-zinc-400">Largeur</label>
                            <span className="text-xs text-zinc-500">
                              {Math.round(editZone.sizeX * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.15}
                            max={2.5}
                            step={0.05}
                            value={editZone.sizeX}
                            onChange={(e) =>
                              setEditZone((prev) =>
                                prev ? { ...prev, sizeX: Number(e.target.value) } : prev
                              )
                            }
                            className="w-full accent-orange-400"
                          />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <label className="text-xs text-zinc-400">Hauteur</label>
                            <span className="text-xs text-zinc-500">
                              {Math.round(editZone.sizeY * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.15}
                            max={2.5}
                            step={0.05}
                            value={editZone.sizeY}
                            onChange={(e) =>
                              setEditZone((prev) =>
                                prev ? { ...prev, sizeY: Number(e.target.value) } : prev
                              )
                            }
                            className="w-full accent-orange-400"
                          />
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between">
                          <label className="text-xs text-zinc-400">
                            Que faire dans cette zone ?
                          </label>
                          <span className="text-xs text-zinc-600">
                            {editInstruction.length}/{EDIT_INSTRUCTION_MAX}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={editInstruction}
                          onChange={(e) => setEditInstruction(e.target.value)}
                          maxLength={EDIT_INSTRUCTION_MAX}
                          placeholder="Ex : réduis la saturation de cet objet / déplace-le plus à droite / enlève cet élément"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-orange-400 focus:outline-none"
                        />
                        <p className="mt-1 text-xs text-zinc-500">
                          Laisse vide si tu ne veux pas de retouche ciblée cette
                          fois — la zone reste en place mais rien n&apos;est
                          modifié tant qu&apos;il n&apos;y a pas d&apos;instruction.
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">
                      Pour corriger un détail précis (une couleur trop vive, un
                      objet à déplacer ou enlever) sans retoucher tout le reste
                      de la photo.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-semibold text-zinc-300">
                      Images de référence ({referenceImages.length}/{MAX_REFERENCE_IMAGES})
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {referenceImages.map((ref) => (
                      <div key={ref.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ref.previewUrl}
                          alt="Référence"
                          className="h-14 w-14 rounded-lg border border-zinc-700 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReferenceImage(ref.id)}
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {referenceImages.length < MAX_REFERENCE_IMAGES && (
                      <button
                        type="button"
                        onClick={() => referenceInputRef.current?.click()}
                        className="rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-zinc-500"
                      >
                        + Ajouter une image
                      </button>
                    )}
                  </div>
                  <input
                    ref={referenceInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleReferenceChange}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Décris dans le champ ci-dessus ce que l&apos;IA doit reprendre de
                    chaque image (ex : &quot;ajoute le logo de la première image en
                    haut à droite&quot;).
                  </p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          {willUseAi && (
            <p className="text-xs text-zinc-500">
              {willDoTargetedEdit
                ? "🎯 Retouche ciblée : une vraie génération IA va appliquer ce changement dans la zone marquée (~10-15s, consomme ton quota IA)."
                : willReuseAiBase
                ? "🔁 Seuls le texte, les couleurs et les formes ont changé depuis la dernière génération IA — retouche instantanée, sans nouvel appel IA (et sans consommer ton quota)."
                : "✨ Le prochain clic lance une nouvelle génération IA (10-20s) — la photo, le style, la description, les références ou la zone visage ont changé."}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {loading
              ? willDoTargetedEdit
                ? "Retouche ciblée en cours..."
                : willUseAi && !willReuseAiBase
                ? "Génération IA en cours (10-20s)..."
                : "Génération..."
              : "Générer la miniature"}
          </button>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-sm font-semibold text-zinc-300">
              Résultat
            </label>
            {resultUrl && previewUrl && (
              <div className="flex overflow-hidden rounded-full border border-zinc-700 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setShowOriginal(false)}
                  className={`px-3 py-1 transition ${
                    !showOriginal ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Après
                </button>
                <button
                  type="button"
                  onClick={() => setShowOriginal(true)}
                  className={`px-3 py-1 transition ${
                    showOriginal ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Avant
                </button>
              </div>
            )}
          </div>
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={showOriginal && previewUrl ? previewUrl : resultUrl}
                alt={showOriginal ? "Photo originale" : "Miniature générée"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm text-zinc-600">
                Ta miniature apparaîtra ici
              </span>
            )}
          </div>
          {resultUrl && (
            <>
              <p className="mt-2 text-center text-xs text-zinc-500">
                {showOriginal
                  ? "Ta photo de départ, avant MIN IA."
                  : "Bascule sur \"Avant\" pour voir le chemin parcouru."}
              </p>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  📱 Aperçu dans le flux mobile
                </p>
                <div className="flex gap-3">
                  <div className="h-[73px] w-[130px] shrink-0 overflow-hidden rounded-lg bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resultUrl}
                      alt="Aperçu de la miniature à taille mobile réelle"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 gap-2">
                    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-zinc-700" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="line-clamp-2 text-[13px] font-medium leading-tight text-zinc-100">
                        {textLayers.find((l) => l.text.trim())?.text || "Ton titre de vidéo"}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Ta chaîne · 128 k vues · il y a 2 jours
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  Vérifie que ton texte et ton sujet restent lisibles à cette
                  taille — c&apos;est comme ça que la majorité des gens
                  verront ta miniature, sur mobile.
                </p>
              </div>

              {isPaid ? (
                <a
                  href={resultUrl}
                  download="thumbnail.png"
                  className="mt-4 block w-full rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold transition hover:border-zinc-400"
                >
                  Télécharger en HD
                </a>
              ) : (
                <Link
                  href="/pricing"
                  className="mt-4 block w-full rounded-full bg-yellow-400 px-6 py-3 text-center font-bold text-black transition hover:bg-yellow-300"
                >
                  Passe sur un plan pour télécharger en HD
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
