"use client";

import { useState, useRef } from "react";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

// Throwaway, owner-only test page — see app/api/admin/test-transition/
// route.ts for what this actually does and why. Delete once decided.
const OWNER_EMAIL = "mathis.ferry76@gmail.com";

export default function TestTransitionPage() {
  const { loading, session } = useSupabaseUser();
  const [status, setStatus] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }

  async function poll(predictionId: string) {
    try {
      const res = await fetch(`/api/admin/test-transition/status?predictionId=${predictionId}`, {
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      const data: { status?: string; url?: string; error?: string } = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Erreur inconnue.");
        setStatus(null);
        return;
      }
      setStatus(data.status ?? null);
      if (data.status === "succeeded" && data.url) {
        setVideoUrl(data.url);
        return;
      }
      if (data.status === "failed" || data.status === "canceled") {
        return;
      }
      pollTimer.current = setTimeout(() => poll(predictionId), 4000);
    } catch {
      setError("Erreur réseau pendant le suivi.");
    }
  }

  async function startTest() {
    if (!session) return;
    stopPolling();
    setError(null);
    setVideoUrl(null);
    setStatus("starting");
    try {
      const res = await fetch("/api/admin/test-transition", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data: { predictionId?: string; error?: string } = await res.json();
      if (!res.ok || !data.predictionId) {
        setError(data.error ?? "Erreur inconnue.");
        setStatus(null);
        return;
      }
      poll(data.predictionId);
    } catch {
      setError("Erreur réseau pendant le lancement.");
      setStatus(null);
    }
  }

  if (loading) return null;
  if (!session || session.user.email?.toLowerCase() !== OWNER_EMAIL) {
    return <div className="p-10 text-center text-zinc-400">Non autorisé.</div>;
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-bold">Test : transition Peugeot → Ferrari</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Seedance 2.5, mode first/last-frame. Coût estimé ~0,50-1,15€.
      </p>
      <button
        type="button"
        onClick={startTest}
        disabled={status !== null && status !== "failed" && status !== "canceled"}
        className="mt-6 rounded-full bg-emerald-400 px-8 py-3 font-bold text-black disabled:opacity-50"
      >
        Lancer le test
      </button>

      {status && status !== "succeeded" && (
        <p className="mt-6 text-sm text-zinc-400">Statut : {status}…</p>
      )}
      {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
      {videoUrl && (
        <video
          key={videoUrl}
          src={videoUrl}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="mx-auto mt-6 w-full rounded-xl border border-zinc-800"
        />
      )}
    </div>
  );
}
