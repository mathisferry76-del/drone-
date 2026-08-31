"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  rotate: number;
  repeatDelay: number;
}

function makeSparkles(count: number): Sparkle[] {
  return Array.from({ length: count }).map((_, i) => {
    // Evenly spread around the circle with a little jitter so the burst
    // reads as an explosion, not a perfect ring.
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = 100 + Math.random() * 320;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 10 + Math.random() * 22,
      delay: Math.random() * 1.2,
      duration: 0.9 + Math.random() * 0.9,
      rotate: Math.random() * 180,
      repeatDelay: 0.6 + Math.random() * 0.8,
    };
  });
}

/**
 * The "big reveal" moment: fires once each time `revealKey` changes to a
 * new value (used to key off a freshly generated image so re-showing the
 * same result via the Avant/Après toggle doesn't replay it). The image
 * spins in from small and rotated, explodes up to ~70% of the viewport,
 * with a burst of sparkles flying outward, then settles — dismissable by
 * click or after a few seconds on its own.
 */
export default function ResultReveal({
  src,
  revealKey,
}: {
  src: string | null;
  revealKey: string | number | null;
}) {
  const [show, setShow] = useState(false);
  const [activeSrc, setActiveSrc] = useState<string | null>(null);
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (revealKey === null || !src) return;
    setActiveSrc(src);
    setSparkles(makeSparkles(42));
    setShow(true);
    const timer = setTimeout(() => setShow(false), 5500);
    return () => clearTimeout(timer);
    // Only re-fire when the key identifying *this* result changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <AnimatePresence>
      {show && activeSrc && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          onClick={() => setShow(false)}
        >
          <div
            className="relative flex items-center justify-center"
            style={{ perspective: 1400 }}
          >
            <motion.img
              src={activeSrc}
              alt="Ta miniature générée"
              className="max-h-[70vh] max-w-[70vw] rounded-2xl border border-yellow-400/60 object-contain shadow-[0_0_140px_-15px_theme(colors.yellow.400/80%)]"
              initial={{ scale: 0.12, rotate: -30, rotateY: 180, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, rotateY: 0, opacity: 1 }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            />

            {/* Rendered after the image so the burst always draws on top of
                it, instead of being covered as the image scales up. */}
            {sparkles.map((s) => (
              <motion.span
                key={s.id}
                aria-hidden
                className="absolute z-10 text-yellow-300"
                style={{ fontSize: s.size, filter: "drop-shadow(0 0 6px rgba(250,204,21,0.9))" }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0, rotate: 0 }}
                animate={{ x: s.x, y: s.y, opacity: 0, scale: 1, rotate: s.rotate }}
                transition={{
                  duration: s.duration,
                  delay: s.delay,
                  ease: "easeOut",
                  repeat: Infinity,
                  repeatDelay: s.repeatDelay,
                }}
              >
                ✦
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
