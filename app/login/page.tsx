"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseBrowser();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!supabase) {
      setError(
        "La connexion n'est pas encore configurée sur ce déploiement (variables Supabase manquantes)."
      );
      return;
    }
    if (!email.trim()) return;

    setStatus("sending");
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/generate" },
    });

    if (authError) {
      setError(authError.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-20">
      <h1 className="text-2xl font-extrabold">Connexion</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Reçois un lien magique par email — pas de mot de passe à retenir.
        Ton historique de miniatures et ton abonnement sont liés à ce
        compte, accessibles depuis n&apos;importe quel appareil.
      </p>

      {status === "sent" ? (
        <div className="mt-8 rounded-xl border border-emerald-800/40 bg-emerald-400/5 p-4 text-sm text-emerald-300">
          Email envoyé à <span className="font-semibold">{email}</span> —
          clique sur le lien qu&apos;il contient pour te connecter.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {status === "sending" ? "Envoi..." : "Recevoir le lien de connexion"}
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-xs text-zinc-500">
        Tu peux aussi{" "}
        <Link href="/generate" className="font-semibold text-yellow-400 hover:underline">
          continuer sans compte
        </Link>{" "}
        pour les miniatures gratuites, mais ton historique ne sera pas
        sauvegardé.
      </p>
    </div>
  );
}
