"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PRESETS,
  FREE_GENERATIONS_PER_DEVICE,
  CREATOR_AI_MONTHLY_LIMIT,
  PresetId,
} from "@/lib/presets";

const USAGE_KEY = "thumbai_free_generations_used";
const PLAN_KEY = "thumbai_plan";
const AI_USAGE_KEY = "thumbai_ai_usage";
const AI_DESCRIPTION_MAX = 600;
type Plan = "free" | "creator" | "pro";

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
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedCount, setUsedCount] = useState(0);
  const [plan, setPlan] = useState<Plan>("free");
  const [aiEnhance, setAiEnhance] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiUsesThisMonth, setAiUsesThisMonth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
              1. Ta photo
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 text-zinc-400 transition hover:border-zinc-500"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Aperçu"
                  className="h-full w-full object-contain"
                />
              ) : (
                <>
                  <span className="text-3xl">📷</span>
                  <span className="mt-2 text-sm">Clique pour choisir une photo</span>
                </>
              )}
            </button>
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
                  onClick={() => setPresetId(preset.id)}
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
              <div className="mt-3 border-t border-yellow-800/30 pt-3">
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
                  rows={4}
                  placeholder="Ex : fond de studio avec néons bleus, ambiance coucher de soleil, décor futuriste, plus de contraste, garde mon visage bien visible..."
                  className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Le style {PRESETS.find((p) => p.id === presetId)?.name} donne déjà une
                  ambiance de base — précise ici ce que tu veux changer ou ajouter
                  (décor, lumière, couleurs, objets). Le sujet de ta photo reste
                  toujours reconnaissable.
                </p>
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
