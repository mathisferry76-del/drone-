"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";

const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const STORAGE_KEY = "cookie-consent";

type Consent = "accepted" | "rejected";

// Sécurité audit (2026-09-10) : Google Ads (gtag.js) tournait sans aucun
// consentement, sur chaque visite — un vrai manquement RGPD/CNIL (les
// cookies de mesure publicitaire ne sont jamais exemptés de consentement
// préalable, contrairement aux cookies strictement techniques). Ce
// composant gate désormais le script derrière un vrai choix utilisateur :
// rien ne se charge tant que la personne n'a pas cliqué "Accepter". Vercel
// Analytics (dans app/layout.tsx) reste hors de ce gate — c'est un outil de
// mesure d'audience anonyme, sans cookie ni identifiant individuel, donc
// exempté de consentement.
export default function CookieConsent() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "accepted" || stored === "rejected") setConsent(stored);
    } catch {
      // localStorage indisponible (navigation privée stricte, etc.) — la
      // bannière réapparaîtra à chaque visite plutôt que de bloquer le site.
    }
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function decide(value: Consent) {
    setConsent(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Rien à faire si le stockage échoue — le choix s'applique quand même
      // pour cette visite via le state React.
    }
  }

  // Rien à gater si Google Ads n'est pas configuré sur ce déploiement —
  // pas de bannière à afficher pour un traceur qui n'existe pas.
  if (!GOOGLE_ADS_ID) return null;

  return (
    <>
      {consent === "accepted" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-ads-tag" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GOOGLE_ADS_ID}');`}
          </Script>
        </>
      )}

      {ready && consent === null && (
        <div
          role="dialog"
          aria-label="Consentement aux cookies"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-zinc-950/95 px-6 py-4 backdrop-blur"
        >
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <p className="text-sm text-zinc-300">
              On utilise des cookies de mesure publicitaire (Google Ads) pour
              savoir si nos campagnes fonctionnent. Tu peux les refuser sans
              rien perdre du site.{" "}
              <Link href="/confidentialite" className="text-emerald-400 hover:underline">
                En savoir plus
              </Link>
            </p>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => decide("rejected")}
                className="rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500"
              >
                Refuser
              </button>
              <button
                type="button"
                onClick={() => decide("accepted")}
                className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-bold text-black transition hover:bg-emerald-300"
              >
                Accepter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
