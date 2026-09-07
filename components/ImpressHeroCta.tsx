"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseUser } from "@/lib/useSupabaseUser";

const PLACEHOLDER = "Remplace ma voiture par une Porsche 911 rouge, même angle, même lumière";

// The interactive alternative to a plain "Essayer" button: the visitor
// types the one real thing they want before ever creating an account, and
// clicking through carries that text all the way into /impress's
// description field (via /login's `redirect` param when logged out, see
// app/login/page.tsx) — so signing up feels like unlocking a result
// they've already started, not a wall before the product.
export default function ImpressHeroCta() {
  const { session } = useSupabaseUser();
  const [value, setValue] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const description = value.trim();
    if (!description) return;
    const target = `/impress?description=${encodeURIComponent(description)}`;
    router.push(session ? target : `/login?redirect=${encodeURIComponent(target)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex w-full max-w-xl flex-col gap-3 sm:flex-row">
      <input
        type="text"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={PLACEHOLDER}
        className="flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold text-black shadow-[0_0_40px_-8px_theme(colors.emerald.400)] transition hover:scale-105 hover:bg-emerald-300"
      >
        Voir le résultat →
      </button>
    </form>
  );
}
