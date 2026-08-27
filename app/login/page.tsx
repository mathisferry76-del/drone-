"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

type Mode = "magic" | "password";
type PasswordAction = "signin" | "signup";

function LoginForm() {
  const [mode, setMode] = useState<Mode>("magic");
  const [passwordAction, setPasswordAction] = useState<PasswordAction>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent">("idle");
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");
  const router = useRouter();

  const supabase = getSupabaseBrowser();

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setStatus("idle");
  }

  async function handleMagicLink(e: React.FormEvent) {
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
      options: {
        emailRedirectTo: window.location.origin + "/generate",
        // Read by the profiles trigger on first signup only — has no
        // effect for an email that already has an account.
        data: refCode ? { referral_code: refCode } : undefined,
      },
    });

    if (authError) {
      setError(authError.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  async function handleForgotPassword() {
    setError(null);
    if (!supabase) return;
    if (!email.trim()) {
      setError("Entre ton email d'abord.");
      return;
    }
    setForgotStatus("sending");
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (authError) {
      setError(authError.message);
      setForgotStatus("idle");
      return;
    }
    setForgotStatus("sent");
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!supabase) {
      setError(
        "La connexion n'est pas encore configurée sur ce déploiement (variables Supabase manquantes)."
      );
      return;
    }
    if (!email.trim() || password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }

    setStatus("sending");

    if (passwordAction === "signup") {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin + "/generate",
          data: refCode ? { referral_code: refCode } : undefined,
        },
      });
      if (authError) {
        setError(authError.message);
        setStatus("error");
        return;
      }
      if (data.session) {
        // Email confirmation disabled on this project — signed in right away.
        router.push("/generate");
        return;
      }
      setStatus("sent");
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setError(authError.message);
      setStatus("error");
      return;
    }
    router.push("/generate");
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-20">
      <h1 className="text-2xl font-extrabold">Connexion</h1>

      <div className="mt-4 flex overflow-hidden rounded-full border border-zinc-700 text-sm font-semibold">
        <button
          type="button"
          onClick={() => switchMode("magic")}
          className={`flex-1 px-4 py-2 transition ${
            mode === "magic" ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Lien magique
        </button>
        <button
          type="button"
          onClick={() => switchMode("password")}
          className={`flex-1 px-4 py-2 transition ${
            mode === "password" ? "bg-yellow-400 text-black" : "text-zinc-400 hover:text-white"
          }`}
        >
          Mot de passe
        </button>
      </div>

      <p className="mt-4 text-sm text-zinc-400">
        {mode === "magic"
          ? "Reçois un lien magique par email — pas de mot de passe à retenir."
          : "Un mot de passe protège ton compte même si ta boîte mail est compromise."}{" "}
        Ton historique de miniatures et ton abonnement sont liés à ce compte,
        accessibles depuis n&apos;importe quel appareil.
      </p>

      {refCode && (
        <div className="mt-4 rounded-xl border border-yellow-800/40 bg-yellow-400/5 p-3 text-sm text-yellow-300">
          🎁 Tu as été invité par un ami — vous recevrez chacun des
          miniatures gratuites bonus dès ton inscription.
        </div>
      )}

      {status === "sent" ? (
        <div className="mt-8 rounded-xl border border-emerald-800/40 bg-emerald-400/5 p-4 text-sm text-emerald-300">
          {mode === "magic" ? (
            <>
              Email envoyé à <span className="font-semibold">{email}</span> —
              clique sur le lien qu&apos;il contient pour te connecter.
            </>
          ) : (
            <>
              Email de confirmation envoyé à{" "}
              <span className="font-semibold">{email}</span> — clique sur le
              lien qu&apos;il contient pour activer ton compte.
            </>
          )}
        </div>
      ) : mode === "magic" ? (
        <form onSubmit={handleMagicLink} className="mt-8 space-y-3">
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
      ) : (
        <form onSubmit={handlePasswordSubmit} className="mt-8 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe (8 caractères min.)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {status === "sending"
              ? "..."
              : passwordAction === "signup"
              ? "Créer mon compte"
              : "Se connecter"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPasswordAction((a) => (a === "signin" ? "signup" : "signin"));
              setError(null);
            }}
            className="w-full text-center text-xs font-semibold text-yellow-400 hover:underline"
          >
            {passwordAction === "signin"
              ? "Pas encore de compte ? Créer un compte"
              : "Déjà un compte ? Se connecter"}
          </button>
          {passwordAction === "signin" &&
            (forgotStatus === "sent" ? (
              <p className="text-center text-xs text-emerald-400">
                Email de réinitialisation envoyé, si ce compte existe.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={forgotStatus === "sending"}
                className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300 hover:underline disabled:opacity-60"
              >
                {forgotStatus === "sending" ? "Envoi..." : "Mot de passe oublié ?"}
              </button>
            ))}
        </form>
      )}
    </div>
  );
}
