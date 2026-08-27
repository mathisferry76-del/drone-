"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Clicking the reset-password email link lands here with a recovery
  // token in the URL — supabase-js parses it automatically and fires this
  // event once the recovery session is active, before which updateUser
  // would fail with no session.
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setStatus("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setStatus("error");
      return;
    }
    setStatus("saved");
    setTimeout(() => router.push("/generate"), 1500);
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-20">
      <h1 className="text-2xl font-extrabold">Nouveau mot de passe</h1>

      {!ready ? (
        <p className="mt-4 text-sm text-zinc-400">
          Vérification du lien... Si rien ne se passe, redemande un email de
          réinitialisation depuis la page de connexion.
        </p>
      ) : status === "saved" ? (
        <div className="mt-8 rounded-xl border border-emerald-800/40 bg-emerald-400/5 p-4 text-sm text-emerald-300">
          Mot de passe mis à jour — redirection...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-3">
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nouveau mot de passe (8 caractères min.)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={status === "saving"}
            className="w-full rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {status === "saving" ? "..." : "Enregistrer le mot de passe"}
          </button>
        </form>
      )}
    </div>
  );
}
