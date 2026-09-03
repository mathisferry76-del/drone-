"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import FloatingShowcase from "@/components/motion/FloatingShowcase";

// WebGL needs `window`/canvas, so this loads client-only — a Server
// Component can't use `ssr: false` directly, hence this tiny client
// wrapper around the dynamic import. Falls back to the original static
// mockup screenshot for anyone with prefers-reduced-motion set, so the
// scroll-scatter animation never fights an explicit accessibility
// preference.
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

export default function HeroSceneLoader() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  if (reducedMotion) {
    return (
      <FloatingShowcase
        src="/examples/nature-vive.webp"
        alt="Aperçu d'une miniature générée avec MIN IA"
      />
    );
  }

  return (
    <div className="relative mx-auto -mt-4 h-[380px] w-full max-w-4xl sm:h-[440px]">
      <HeroScene />
    </div>
  );
}
