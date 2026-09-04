"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import HeroTitle from "@/components/motion/HeroTitle";
import CountUp from "@/components/motion/CountUp";

// A scroll-driven sequence of real MIN IA thumbnails — not a 3D render,
// actual photos — that crossfade and slowly zoom (a "Ken Burns" push) as
// the user scrolls through a tall (400vh) pinned section, ending on one
// full-bleed reveal with the CTA.
//
// Progress (0..1) is computed directly from the wrapper's bounding rect in
// a requestAnimationFrame loop and applied straight to each slide's DOM
// style — deliberately not through React state or framer-motion's
// useScroll/useTransform, whose MotionValues turned out to desync from
// real scroll position on this page (opacity read back non-monotonic —
// dipping and rising again — even far past the section). The rAF+ref
// approach is the same one already proven reliable for the previous 3D
// version of this component.
const SHOWCASE = [
  { id: "muay-thai-fight", label: "Sport / combat" },
  { id: "golden-vacation", label: "Luxe / lifestyle" },
  { id: "high-contrast-drama", label: "Business / SaaS" },
  { id: "nature-vive", label: "Outdoor / vlog" },
  { id: "bold-impact", label: "Argent / réussite" },
] as const;

const INTRO_FADE_END = 0.1;
const SEQUENCE_START = 0.12;
const SEQUENCE_END = 1;
const STEP = (SEQUENCE_END - SEQUENCE_START) / SHOWCASE.length;
const OUTRO_START = SEQUENCE_START + (SHOWCASE.length - 1) * STEP + STEP * 0.35;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// Linear ramp from 0 to 1 between [start, end], clamped outside that range.
function ramp(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp01((t - start) / (end - start));
}

export default function HeroJourney() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const outroRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;

    function tick() {
      const wrapper = wrapperRef.current;
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        const t = scrollable > 0 ? clamp01(-rect.top / scrollable) : 0;

        if (introRef.current) {
          const introOpacity = 1 - ramp(t, 0, INTRO_FADE_END);
          introRef.current.style.opacity = String(introOpacity);
          introRef.current.style.pointerEvents = introOpacity > 0.5 ? "auto" : "none";
        }

        if (outroRef.current) {
          const outroOpacity = ramp(t, OUTRO_START, OUTRO_START + 0.08);
          outroRef.current.style.opacity = String(outroOpacity);
          outroRef.current.style.pointerEvents = outroOpacity > 0.5 ? "auto" : "none";
        }

        SHOWCASE.forEach((_, i) => {
          const isLast = i === SHOWCASE.length - 1;
          const start = SEQUENCE_START + i * STEP;
          const fadeInEnd = start + STEP * 0.25;
          const fadeOutStart = start + STEP * 0.85;
          const end = start + STEP;

          const fadeIn = ramp(t, start, fadeInEnd);
          const fadeOut = isLast ? 0 : ramp(t, fadeOutStart, end);
          const opacity = fadeIn * (1 - fadeOut);

          const slide = slideRefs.current[i];
          if (slide) slide.style.opacity = String(opacity);

          const img = imageRefs.current[i];
          if (img) {
            const zoomT = ramp(t, start, end);
            const scale = 1.05 + zoomT * (isLast ? 0.13 : 0.1);
            img.style.transform = `scale(${scale})`;
          }
        });
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section ref={wrapperRef} style={{ height: "400vh" }} className="relative">
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-black">
        {SHOWCASE.map((item, i) => (
          <div
            key={item.id}
            ref={(el) => {
              slideRefs.current[i] = el;
            }}
            className="absolute inset-0"
            style={{ opacity: 0 }}
          >
            <div
              ref={(el) => {
                imageRefs.current[i] = el;
              }}
              className="relative h-full w-full"
              style={{ transform: "scale(1.05)" }}
            >
              <Image
                src={`/examples/${item.id}.webp`}
                alt={`Miniature générée avec MIN IA — ${item.label}`}
                fill
                sizes="100vw"
                className="object-cover"
                priority={i === 0}
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
            <span className="absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
              {item.label}
            </span>
          </div>
        ))}

        <div
          ref={introRef}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 px-6 text-center"
        >
          <HeroContent />
        </div>

        <div
          ref={outroRef}
          className="absolute inset-x-0 bottom-[10%] flex flex-col items-center gap-4 px-6 text-center opacity-0"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            Générée avec MIN IA en 10 secondes
          </p>
          <Link
            href="/generate"
            className="rounded-full bg-emerald-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.emerald.400)] transition hover:scale-105 hover:bg-emerald-300"
          >
            Créer la mienne →
          </Link>
        </div>

        <p className="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5 text-xs text-white/60">
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
          <span className="text-emerald-400">✓</span> Paiement sécurisé (Stripe)
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
