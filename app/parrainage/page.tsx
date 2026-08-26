"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

interface ReferralData {
  code: string | null;
  bonusGenerations: number;
  referredCount: number;
}

export default function ParrainagePage() {
  const { loading: authLoading, session } = useSupabaseUser();
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading || !session) return;
    (async () => {
      try {
        const res = await fetch("/api/referral", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Erreur pendant le chargement.");
          return;
        }
        setData(json);
      } catch {
        setError("Impossible de contacter le serveur.");
      }
    })();
  }, [authLoading, session]);

  if (!authLoading && !session) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">Parrainage</h1>
        <p className="mt-3 text-zinc-400">
          Connecte-toi pour obtenir ton lien de parrainage.
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

  const link = data?.code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/login?ref=${data.code}`
    : null;

  function handleCopy() {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Parraine tes amis créateurs</h1>
      <p className="mt-2 text-zinc-400">
        Chaque ami qui s&apos;inscrit avec ton lien reçoit{" "}
        <span className="font-semibold text-white">2 miniatures gratuites bonus</span>,
        et toi tu reçois{" "}
        <span className="font-semibold text-white">3 miniatures gratuites bonus</span> —
        cumulables sans limite.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {link && (
        <div className="mt-8 rounded-2xl border border-yellow-800/40 bg-yellow-400/5 p-6">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Ton lien de parrainage
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              readOnly
              value={link}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-full bg-yellow-400 px-6 py-3 text-sm font-bold text-black transition hover:bg-yellow-300"
            >
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
        </div>
      )}

      {data && (
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <div className="text-3xl font-extrabold text-yellow-400">{data.referredCount}</div>
            <div className="mt-1 text-sm text-zinc-400">ami(s) inscrit(s)</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
            <div className="text-3xl font-extrabold text-yellow-400">{data.bonusGenerations}</div>
            <div className="mt-1 text-sm text-zinc-400">miniature(s) bonus gagnée(s)</div>
          </div>
        </div>
      )}
    </div>
  );
}
