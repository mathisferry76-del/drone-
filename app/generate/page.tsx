"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PRESETS,
  FREE_GENERATIONS_PER_DEVICE,
  CREATOR_AI_MONTHLY_LIMIT,
  PresetId,
  getPreset,
} from "@/lib/presets";

const USAGE_KEY = "thumbai_free_generations_used";
const PLAN_KEY = "thumbai_plan";
const AI_USAGE_KEY = "thumbai_ai_usage";
const AI_DESCRIPTION_MAX = 1200;
type Plan = "free" | "creator" | "pro";
type BackgroundStyle = "panel" | "shadow" | "none";

const BACKGROUND_STYLE_OPTIONS: { id: BackgroundStyle; label: string }[] = [
  { id: "panel", label: "Panneau" },
  { id: "shadow", label: "Ombre" },
  { id: "none", label: "Aucun" },
];

function currentMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function GeneratePage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<PresetId>("bold-impact");
  const [intensity, setIntensity] = useState(100);
  const [title, setTitle] = useState("");
  const [textColor, setTextColor] = useState("#FFE000");
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("panel");
  const [textPos, setTextPos] = useState({ x: 0.5, y: 0.85 });
  const [curve, setCurve] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedCount, setUsedCount] = useState(0);
  const [plan, setPlan] = useState<Plan>("free");
  const [aiEnhance, setAiEnhance] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiUsesThisMonth, setAiUsesThisMonth] = useState(0);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const isPaid = plan !== "free";
  const aiPlanEligible = plan === "creator" || plan === "pro";
  const aiLimitReached = plan === "creator" && aiUsesThisMonth >= CREATOR_AI_MONTHLY_LIMIT;
  const canUseAi = aiPlanEligible && !aiLimitReached;
  const aiRemaining = Math.max(CREATOR_AI_MONTHLY_LIMIT - aiUsesThisMonth, 0);

  // localStorage/window only exist client-side, so this state can't be read
  // during the server render — it has to be hydrated in an effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const used = Number(window.localStorage.getItem(USAGE_KEY) ?? "0");
    const params = new URLSearchParams(window.location.search);
    const justUpgraded = params.get("success") === "true";
    const upgradedTier = params.get("tier") === "pro" ? "pro" : "creator";

    if (justUpgraded) {
      window.localStorage.setItem(PLAN_KEY, upgradedTier);
    }

    const storedPlan = window.localStorage.getItem(PLAN_KEY);
    const resolvedPlan: Plan = justUpgraded
      ? upgradedTier
      : storedPlan === "pro" || storedPlan === "creator"
        ? storedPlan
        : "free";

    const month = currentMonthId();
    let aiUsage = { month, count: 0 };
    try {
      const stored = JSON.parse(window.localStorage.getItem(AI_USAGE_KEY) ?? "null");
      if (stored && stored.month === month) aiUsage = stored;
    } catch {
      // ignore malformed stored value, fall back to a fresh counter
    }
    window.localStorage.setItem(AI_USAGE_KEY, JSON.stringify(aiUsage));

    setUsedCount(used);
    setPlan(resolvedPlan);
    setAiUsesThisMonth(aiUsage.count);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResultUrl(null);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }

  function handleReferenceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setReferenceImage(f);
    setReferencePreviewUrl(URL.createObjectURL(f));
  }

  function selectPreset(id: PresetId) {
    setPresetId(id);
    const preset = getPreset(id);
    setTextColor(preset.textColor);
    setStrokeColor(preset.strokeColor.length === 7 ? preset.strokeColor : "#000000");
  }

  function updateTextPosFromPointer(clientX: number, clientY: number) {
    const box = previewBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = Math.min(0.95, Math.max(0.05, (clientX - rect.left) / rect.width));
    const y = Math.min(0.95, Math.max(0.08, (clientY - rect.top) / rect.height));
    setTextPos({ x, y });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    updateTextPosFromPointer(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    updateTextPosFromPointer(e.clientX, e.clientY);
  }

  function handlePointerUp() {
    dragging.current = false;
  }

  const quotaReached = !isPaid && usedCount >= FREE_GENERATIONS_PER_DEVICE;

  async function handleGenerate() {
    setError(null);

    if (!file) {
      setError("Ajoute d'abord une photo.");
      return;
    }
    if (!title.trim()) {
      setError("Ajoute un titre pour ta miniature.");
      return;
    }
    if (quotaReached) {
      setError("Quota gratuit atteint. Passe sur un plan payant pour continuer.");
      return;
    }

    const willUseAi = canUseAi && aiEnhance;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("presetId", presetId);
      formData.append("title", title);
      formData.append("watermark", isPaid ? "false" : "true");
      formData.append("aiEnhance", willUseAi ? "true" : "false");
      formData.append("aiDescription", aiDescription);
      formData.append("intensity", String(intensity));
      formData.append("textColor", textColor);
      formData.append("strokeColor", strokeColor);
      formData.append("backgroundStyle", backgroundStyle);
      formData.append("textX", String(textPos.x));
      formData.append("textY", String(textPos.y));
      formData.append("curve", String(curve));
      if (willUseAi && referenceImage) {
        formData.append("referenceImage", referenceImage);
      }

      const res = await fetch("/api/generate", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erreur pendant la génération.");
        return;
      }

      setResultUrl(data.image);
      if (!isPaid) {
        const next = usedCount + 1;
        setUsedCount(next);
        window.localStorage.setItem(USAGE_KEY, String(next));
      }
      if (willUseAi && plan === "creator") {
        const next = aiUsesThisMonth + 1;
        setAiUsesThisMonth(next);
        window.localStorage.setItem(
          AI_USAGE_KEY,
          JSON.stringify({ month: currentMonthId(), count: next })
        );
      }
    } catch {
      setError("Impossible de contacter le serveur. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Créer une miniature</h1>
      <p className="mt-2 text-zinc-400">
        {isPaid
          ? `Plan ${plan === "pro" ? "Pro" : "Creator"} actif — miniatures illimitées, sans filigrane.`
          : `${Math.max(
              FREE_GENERATIONS_PER_DEVICE - usedCount,
              0
            )} miniature(s) gratuite(s) restante(s) sur cet appareil.`}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">
              1. Ta photo — clique/glisse le titre pour le positionner
            </label>
            <div
              ref={previewBoxRef}
              onPointerDown={previewUrl ? handlePointerDown : undefined}
              onPointerMove={previewUrl ? handlePointerMove : undefined}
              onPointerUp={handlePointerUp}
              className="relative aspect-video w-full touch-none overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950"
            >
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Aperçu"
                    className="pointer-events-none h-full w-full object-contain"
                  />
                  <div
                    className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full bg-yellow-400 px-2 py-1 text-[10px] font-bold text-black shadow-lg"
                    style={{ left: `${textPos.x * 100}%`, top: `${textPos.y * 100}%` }}
                  >
                    ✥ Titre
                  </div>
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
              <p className="mt-1 text-xs text-zinc-500">
                {canUseAi && aiEnhance
                  ? "Ne s'applique pas en mode IA générative."
                  : "0% = photo d'origine, 100% = effet du style en entier."}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">
              3. Titre d&apos;accroche
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="J'AI TESTÉ ÇA PENDANT 30 JOURS"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <label className="mb-3 block text-sm font-semibold text-zinc-300">
              4. Personnalisation du titre
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Couleur du texte</label>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">Couleur du contour</label>
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs text-zinc-400">Fond derrière le titre</label>
              <div className="grid grid-cols-3 gap-2">
                {BACKGROUND_STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBackgroundStyle(opt.id)}
                    className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                      backgroundStyle === opt.id
                        ? "border-yellow-400 bg-yellow-400/10 text-white"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs text-zinc-400">Courbure du titre</label>
                <span className="text-xs text-zinc-500">{curve}</span>
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                value={curve}
                onChange={(e) => setCurve(Number(e.target.value))}
                className="w-full accent-yellow-400"
              />
              <p className="mt-1 text-xs text-zinc-500">
                0 = droit. Fonctionne mieux avec un titre court sur une ligne.
              </p>
            </div>
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
                disabled={!canUseAi}
                onChange={(e) => setAiEnhance(e.target.checked)}
                className="mt-1 h-4 w-4 accent-yellow-400 disabled:opacity-40"
              />
              <span>
                <span className="block text-sm font-bold">
                  ✨ Amélioration IA générative{" "}
                  {!aiPlanEligible && (
                    <span className="ml-1 rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                      Creator / Pro
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-xs text-zinc-400">
                  {plan === "pro" &&
                    "Retravaille réellement l'éclairage et l'ambiance de ta photo avec une IA générative, en illimité."}
                  {plan === "creator" && !aiLimitReached &&
                    `Retravaille réellement l'éclairage et l'ambiance de ta photo avec une IA générative. Il te reste ${aiRemaining}/${CREATOR_AI_MONTHLY_LIMIT} génération(s) IA ce mois-ci.`}
                  {plan === "creator" && aiLimitReached &&
                    `Tu as utilisé tes ${CREATOR_AI_MONTHLY_LIMIT} générations IA incluses ce mois-ci. Reviens le mois prochain, ou passe en Pro pour un accès illimité.`}
                  {!aiPlanEligible &&
                    "Réservé aux plans Creator (2/mois) et Pro (illimité) : une vraie IA régénère l'éclairage et l'ambiance de la photo, pas juste un filtre."}
                </span>
                {!aiPlanEligible && (
                  <Link
                    href="/pricing"
                    className="mt-1 inline-block text-xs font-semibold text-yellow-400 hover:underline"
                  >
                    Voir les plans →
                  </Link>
                )}
                {aiLimitReached && (
                  <Link
                    href="/pricing"
                    className="mt-1 inline-block text-xs font-semibold text-yellow-400 hover:underline"
                  >
                    Passer en Pro pour un accès illimité →
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
                    vraie miniature mise en scène plutôt qu&apos;un simple filtre. Le
                    visage reste protégé, non modifié.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-300">
                    Image de référence (optionnel)
                  </label>
                  {referencePreviewUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={referencePreviewUrl}
                        alt="Référence"
                        className="h-14 w-14 rounded-lg border border-zinc-700 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setReferenceImage(null);
                          setReferencePreviewUrl(null);
                        }}
                        className="text-xs font-semibold text-zinc-400 hover:text-white"
                      >
                        Retirer
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => referenceInputRef.current?.click()}
                      className="rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-zinc-500"
                    >
                      + Ajouter une image (logo, objet...) à intégrer
                    </button>
                  )}
                  <input
                    ref={referenceInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReferenceChange}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Décris dans le champ ci-dessus ce que l&apos;IA doit reprendre de
                    cette image (ex : &quot;ajoute le logo de cette image en haut à
                    droite&quot;).
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

          {quotaReached ? (
            <Link
              href="/pricing"
              className="block w-full rounded-full bg-yellow-400 px-6 py-3 text-center font-bold text-black transition hover:bg-yellow-300"
            >
              Passer sur un plan payant
            </Link>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-60"
            >
              {loading
                ? canUseAi && aiEnhance
                  ? "Génération IA en cours (10-20s)..."
                  : "Génération..."
                : "Générer la miniature"}
            </button>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-zinc-300">
            Résultat
          </label>
          <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
            {resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resultUrl} alt="Miniature générée" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm text-zinc-600">
                Ta miniature apparaîtra ici
              </span>
            )}
          </div>
          {resultUrl && (
            <a
              href={resultUrl}
              download="thumbnail.png"
              className="mt-4 block w-full rounded-full border border-zinc-600 px-6 py-3 text-center font-semibold transition hover:border-zinc-400"
            >
              Télécharger en HD
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
