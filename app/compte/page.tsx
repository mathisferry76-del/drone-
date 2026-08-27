"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import { getSupabaseBrowser, Profile } from "@/lib/supabase";

export default function ComptePage() {
  const { loading: authLoading, session } = useSupabaseUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data as Profile);
      });
  }, [session]);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setPasswordStatus("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setPasswordError(updateError.message);
      setPasswordStatus("error");
      return;
    }
    setNewPassword("");
    setPasswordStatus("saved");
  }

  async function handleLogout() {
    const supabase = getSupabaseBrowser();
    await supabase?.auth.signOut();
  }

  if (!authLoading && !session) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="text-2xl font-extrabold">Mon compte</h1>
        <p className="mt-3 text-zinc-400">Connecte-toi pour gérer ton compte.</p>
        <Link
          href="/login"
          className="mt-6 rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  const planLabel = profile
    ? profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Mon compte</h1>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="font-bold">Informations</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Email</dt>
            <dd className="text-zinc-200">{session?.user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Plan</dt>
            <dd className="text-zinc-200">
              {planLabel && planLabel !== "Free" ? planLabel : "Aucun abonnement"}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/pricing" className="text-yellow-400 hover:underline">
            Voir les plans →
          </Link>
          <Link href="/historique" className="text-yellow-400 hover:underline">
            Mon historique →
          </Link>
          <Link href="/parrainage" className="text-yellow-400 hover:underline">
            Mon parrainage →
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="font-bold">🔒 Mot de passe</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Définis (ou change) le mot de passe de ce compte — utile si tu t&apos;es
          inscrit par lien magique et veux pouvoir te connecter même si ta
          boîte mail est compromise.
        </p>
        <form onSubmit={handleSetPassword} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nouveau mot de passe (8 caractères min.)"
            className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={passwordStatus === "saving"}
            className="shrink-0 rounded-full bg-yellow-400 px-6 py-3 text-sm font-bold text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {passwordStatus === "saving" ? "..." : "Définir ce mot de passe"}
          </button>
        </form>
        {passwordError && <p className="mt-2 text-sm text-red-400">{passwordError}</p>}
        {passwordStatus === "saved" && (
          <p className="mt-2 text-sm text-emerald-400">
            Mot de passe enregistré — utilisable dès ta prochaine connexion.
          </p>
        )}
      </div>

      <button
        onClick={handleLogout}
        className="mt-6 w-full rounded-full border border-zinc-700 px-6 py-3 text-center font-semibold text-zinc-300 transition hover:border-zinc-500"
      >
        Se déconnecter
      </button>
    </div>
  );
}
