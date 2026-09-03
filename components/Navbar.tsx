"use client";

import { useState } from "react";
import Link from "next/link";
import { useSupabaseUser } from "@/lib/useSupabaseUser";
import { getSupabaseBrowser } from "@/lib/supabase";

// Tarifs deliberately has no nav entry at all, logged in or not — the
// price only shows up inline once someone hits the paywall inside
// /generate (the highest-intent moment), not as something to browse to
// beforehand. /pricing itself still exists for account/plan management.
const BASE_LINKS = [
  { href: "/#styles", label: "Styles" },
  { href: "/#resultats", label: "Nos résultats" },
  { href: "/impress", label: "✨ Impressionne tes potes" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { session } = useSupabaseUser();

  async function handleLogout() {
    const supabase = getSupabaseBrowser();
    await supabase?.auth.signOut();
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight text-white"
          onClick={() => setOpen(false)}
        >
          <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-black">MIN</span>
          IA
        </Link>

        <div className="hidden items-center gap-6 text-sm font-medium text-zinc-300 lg:flex">
          {BASE_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </Link>
          ))}
          {session ? (
            <>
              <Link href="/historique" className="transition hover:text-white">
                Historique
              </Link>
              <Link href="/parrainage" className="transition hover:text-white">
                Parrainage
              </Link>
              <Link href="/compte" className="transition hover:text-white">
                Mon compte
              </Link>
              <Link href="/contact" className="transition hover:text-white">
                Donner mon avis
              </Link>
              <button onClick={handleLogout} className="transition hover:text-white">
                Déconnexion
              </button>
            </>
          ) : (
            <Link href="/login" className="transition hover:text-white">
              Connexion
            </Link>
          )}
          <Link
            href="/generate"
            className="rounded-full bg-yellow-400 px-4 py-2 font-bold text-black transition hover:bg-yellow-300"
          >
            Créer une miniature
          </Link>
        </div>

        <div className="flex items-center gap-3 sm:hidden">
          <Link
            href="/generate"
            className="rounded-full bg-yellow-400 px-4 py-2 text-sm font-bold text-black transition hover:bg-yellow-300"
          >
            Créer
          </Link>
          <button
            type="button"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border border-zinc-700 transition hover:border-zinc-500"
          >
            <span
              className={`h-0.5 w-5 bg-white transition ${open ? "translate-y-2 rotate-45" : ""}`}
            />
            <span className={`h-0.5 w-5 bg-white transition ${open ? "opacity-0" : ""}`} />
            <span
              className={`h-0.5 w-5 bg-white transition ${open ? "-translate-y-2 -rotate-45" : ""}`}
            />
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-zinc-800 bg-black px-6 py-4 sm:hidden">
          <div className="flex flex-col gap-1 text-sm font-medium text-zinc-300">
            {BASE_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 transition hover:bg-zinc-900 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            {session ? (
              <>
                <Link
                  href="/historique"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2.5 transition hover:bg-zinc-900 hover:text-white"
                >
                  Historique
                </Link>
                <Link
                  href="/parrainage"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2.5 transition hover:bg-zinc-900 hover:text-white"
                >
                  Parrainage
                </Link>
                <Link
                  href="/compte"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2.5 transition hover:bg-zinc-900 hover:text-white"
                >
                  Mon compte
                </Link>
                <Link
                  href="/contact"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2.5 transition hover:bg-zinc-900 hover:text-white"
                >
                  Donner mon avis
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-lg px-2 py-2.5 text-left transition hover:bg-zinc-900 hover:text-white"
                >
                  Déconnexion
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 transition hover:bg-zinc-900 hover:text-white"
              >
                Connexion
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
