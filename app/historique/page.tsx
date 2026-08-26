"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

interface HistoryItem {
  id: string;
  presetId: string | null;
  usedAi: boolean;
  createdAt: string;
  url: string | null;
}

export default function HistoriquePage() {
  const { loading: authLoading, session } = useSupabaseUser();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/history", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Erreur pendant le chargement.");
          return;
        }
        setItems(data.items ?? []);
      } catch {
        setError("Impossible de contacter le serveur.");
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleDelete(id: string) {
    if (!session) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch("/api/history", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  if (!authLoading && !session) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">Historique</h1>
        <p className="mt-3 text-zinc-400">
          Connecte-toi pour voir et retrouver tes miniatures générées, sur
          n&apos;importe quel appareil.
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

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Ton historique</h1>
      <p className="mt-2 text-zinc-400">
        Les miniatures générées pendant que tu es connecté sont sauvegardées
        ici automatiquement.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-10 text-sm text-zinc-500">Chargement...</p>
      ) : items.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-700 p-10 text-center text-zinc-500">
          Rien pour l&apos;instant — génère une miniature en étant connecté,
          elle apparaîtra ici.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50"
            >
              <div className="relative aspect-video w-full bg-zinc-950">
                {item.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt="Miniature générée"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex items-center justify-between p-4">
                <div className="text-xs text-zinc-500">
                  {new Date(item.createdAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {item.usedAi && <span className="ml-2 text-yellow-400">✨ IA</span>}
                </div>
                <div className="flex gap-3 text-xs font-semibold">
                  {item.url && (
                    <a
                      href={item.url}
                      download
                      className="text-yellow-400 hover:underline"
                    >
                      Télécharger
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-red-400 hover:underline"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
