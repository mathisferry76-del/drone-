"use client";

import { useState } from "react";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

const DESCRIPTION_MAX = 400;

// Test page for the Veo 3.1 (Google, via fal.ai) image-to-video capability
// — see app/api/animate/route.ts. Deliberately separate from /impress
// rather than bolted onto its result screen: this is an unpriced,
// owner-only prototype (~1.60$ per 4s/1080p/audio clip, no credit cost
// decided yet), not a feature other accounts should be able to reach.
export default function AnimatePage() {
  const { loading: authLoading, session } = useSupabaseUser();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setVideoUrl(null);
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
      setError("Décris le mouvement/l'animation que tu veux voir.");
      return;
    }
    if (!session) {
      setError("Connecte-toi d'abord.");
      return;
    }

    setVideoUrl(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("description", description.trim());

      const res = await fetch("/api/animate", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      let data: { video?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        setError(
          "Le serveur a mis trop de temps à répondre ou a coupé la connexion. Réessaie."
        );
        return;
      }

      if (!res.ok || !data.video) {
        setError(data.error ?? "Erreur pendant la génération vidéo.");
        return;
      }
      setVideoUrl(data.video);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return <div className="mx-auto w-full max-w-3xl px-6 py-16 text-zinc-500">Chargement...</div>;
  }

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center text-zinc-400">
        Connecte-toi pour tester cette fonctionnalité.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-extrabold">🎬 Animation vidéo (test)</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Prototype interne — Veo 3.1 (Google, via fal.ai), 1080p avec son, clip de 4 secondes.
        Environ 1,60$ par génération, pas encore ouvert en dehors de ce compte.
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <label className="mb-2 block text-sm font-semibold text-zinc-300">1. Ta photo</label>
          <div className="relative flex w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950 aspect-video">
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
              2. Décris le mouvement/l&apos;animation
            </label>
            <span className="text-xs text-zinc-500">
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            rows={3}
            placeholder="Ex : la caméra tourne lentement autour de la voiture, reflets qui bougent sur la carrosserie"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleGenerate}
          disabled={!file || loading}
          className="w-full rounded-full bg-emerald-400 px-6 py-3 font-bold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Génération en cours (peut prendre plusieurs minutes)..." : "Générer la vidéo →"}
        </button>

        {videoUrl && (
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-300">Résultat</label>
            <video src={videoUrl} controls autoPlay loop className="w-full rounded-xl border border-zinc-800" />
          </div>
        )}
      </div>
    </div>
  );
}
