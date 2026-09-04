"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import HeroTitle from "@/components/motion/HeroTitle";
import CountUp from "@/components/motion/CountUp";

const JourneyScene = dynamic(() => import("./JourneyScene"), { ssr: false });

const SECTION_HEIGHT_VH = 500;

export default function HeroJourney() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const introRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;

    function tick() {
      const wrapper = wrapperRef.current;
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        const t = scrollable > 0 ? -rect.top / scrollable : 0;
        progressRef.current = Math.min(1, Math.max(0, t));
      }

      const t = progressRef.current;
      if (introRef.current) {
        const introOpacity = 1 - Math.min(1, t / 0.12);
        introRef.current.style.opacity = String(Math.max(0, introOpacity));
        introRef.current.style.pointerEvents = introOpacity > 0.5 ? "auto" : "none";
      }
      if (outroRef.current) {
        const outroOpacity = Math.max(0, Math.min(1, (t - 0.9) / 0.08));
        outroRef.current.style.opacity = String(outroOpacity);
        outroRef.current.style.pointerEvents = outroOpacity > 0.5 ? "auto" : "none";
      }
      if (flashRef.current) {
        let flashOpacity = 0;
        if (t < 0.4) flashOpacity = 0;
        else if (t < 0.45) flashOpacity = (t - 0.4) / 0.05;
        else if (t < 0.5) flashOpacity = 1;
        else if (t < 0.58) flashOpacity = 1 - (t - 0.5) / 0.08;
        flashRef.current.style.opacity = String(Math.max(0, Math.min(1, flashOpacity)));
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <section className="relative overflow-hidden px-6 pb-16 pt-20 text-center">
        <HeroContent />
      </section>
    );
  }

  return (
    <section ref={wrapperRef} style={{ height: `${SECTION_HEIGHT_VH}vh` }} className="relative">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black">
        {mounted && <JourneyScene progressRef={progressRef} />}

        <div ref={introRef} className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <HeroContent />
        </div>

        <div
          ref={outroRef}
          className="pointer-events-none absolute inset-x-0 bottom-[8%] flex flex-col items-center gap-4 px-6 text-center opacity-0"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            Générée avec MIN IA en 10 secondes
          </p>
          <Link
            href="/generate"
            className="pointer-events-auto rounded-full bg-emerald-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.emerald.400)] transition hover:scale-105 hover:bg-emerald-300"
          >
            Créer la mienne →
          </Link>
        </div>

        <div ref={flashRef} className="pointer-events-none absolute inset-0 bg-white opacity-0" />

        <p className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5 text-xs text-white/50">
          <span className="animate-bounce">↓</span> Continue à scroller
        </p>
      </div>
    </section>
  );
}

function HeroContent() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center">
      <span className="mb-4 rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-300 backdrop-blur">
        Fait pour les créateurs solo
      </span>
      <HeroTitle className="text-4xl font-extrabold leading-tight tracking-tight text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] sm:text-6xl">
        Plus de vues sur tes vidéos, avec{" "}
        <span className="bg-gradient-to-r from-emerald-400 to-teal-600 bg-clip-text text-transparent">
          zéro compétence design
        </span>
      </HeroTitle>
      <p className="mt-6 max-w-xl text-lg text-zinc-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
        Upload une photo, choisis un style, ajoute ton titre. MIN IA génère
        en 10 secondes une miniature optimisée pour le clic — sans
        designer, sans Photoshop, sans passer 30 minutes sur Canva.
      </p>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/generate"
          className="rounded-full bg-emerald-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.emerald.400)] transition hover:scale-105 hover:bg-emerald-300"
        >
          Créer ma première miniature →
        </Link>
        <Link
          href="/pricing"
          className="rounded-full border border-white/30 bg-black/20 px-8 py-3 text-base font-semibold text-white backdrop-blur transition hover:scale-105 hover:border-white/60"
        >
          Voir les tarifs
        </Link>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        <span className="flex items-center gap-1.5">
          <span className="text-emerald-400">✓</span> Résiliable en 1 clic
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-emerald-400">✓</span> Sans engagement de durée
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-blue-400">✓</span> Paiement sécurisé (Stripe)
        </span>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-zinc-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
        <span><CountUp value={10} className="font-bold text-white" /> styles prêts à l&apos;emploi</span>
        <span className="hidden h-4 w-px bg-white/20 sm:block" />
        <span><CountUp value={5} className="font-bold text-white" /> calques de texte + formes</span>
        <span className="hidden h-4 w-px bg-white/20 sm:block" />
        <span>IA générative <span className="font-bold text-white">Gemini 2.5 Flash</span></span>
      </div>
    </div>
  );
}
