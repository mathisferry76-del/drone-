import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorGlow from "@/components/motion/CursorGlow";
import CookieConsent from "@/components/CookieConsent";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://min-ia.fr";
const TITLE = "MIN IA — Flex tes photos et crée tes miniatures YouTube par IA";
const DESCRIPTION =
  "Transforme n'importe quelle photo en flex bluffant (voiture, montre, style) ou crée tes miniatures YouTube, TikTok et Reels optimisées pour le clic — en quelques secondes grâce à l'IA.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — MIN IA" },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  keywords: [
    "générateur de miniature YouTube",
    "miniature YouTube IA",
    "créer miniature youtube gratuit",
    "thumbnail YouTube IA",
    "miniature TikTok",
    "outil miniature créateur de contenu",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "MIN IA",
    locale: "fr_FR",
    type: "website",
    images: [{ url: "/examples/bold-impact.webp", width: 1280, height: 720 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/examples/bold-impact.webp"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-black text-white">
        <div aria-hidden className="grain-overlay" />
        <CursorGlow />
        <Navbar />
        <main className="flex flex-1 flex-col">{children}</main>
        <Footer />
        {/* Compte de pages vues/visiteurs (Vercel Analytics — visible dans
            l'onglet Analytics du dashboard Vercel du projet). Aucune
            variable d'environnement requise, actif automatiquement dès le
            déploiement sur Vercel ; c'était le chiffre manquant pour
            calculer le taux de conversion visiteurs → inscriptions. */}
        <Analytics />
        <CookieConsent />
      </body>
    </html>
  );
}
