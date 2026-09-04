"use client";

import { motion } from "framer-motion";

const SPARKLES = [
  { top: "12%", left: "12%", size: 16, delay: 0 },
  { top: "18%", left: "82%", size: 22, delay: 0.35 },
  { top: "75%", left: "10%", size: 14, delay: 0.7 },
  { top: "80%", left: "85%", size: 20, delay: 1.05 },
  { top: "6%", left: "50%", size: 12, delay: 1.4 },
  { top: "92%", left: "48%", size: 14, delay: 1.75 },
];

/**
 * Loading state for the result preview: the card rises into place then
 * spins continuously on its Y axis (a 3D "reveal" flip), with sparkles
 * twinkling around it — a bit of showmanship for the 10-20s AI wait
 * instead of a plain spinner.
 */
export default function GeneratingCard({ label }: { label: string }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {SPARKLES.map((s, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="absolute text-emerald-300"
          style={{ top: s.top, left: s.left, fontSize: s.size }}
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], rotate: [0, 90] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            delay: s.delay,
            ease: "easeInOut",
          }}
        >
          ✦
        </motion.span>
      ))}

      <div style={{ perspective: 900 }}>
        <motion.div
          className="flex aspect-video w-40 items-center justify-center rounded-2xl border border-emerald-400/50 bg-gradient-to-br from-zinc-800 to-zinc-900 shadow-[0_0_45px_-8px_theme(colors.emerald.400/60%)] sm:w-52"
          style={{ transformStyle: "preserve-3d" }}
          initial={{ y: 90, opacity: 0, rotateY: 0 }}
          animate={{ y: 0, opacity: 1, rotateY: 360 }}
          transition={{
            y: { duration: 0.6, ease: "easeOut" },
            opacity: { duration: 0.5 },
            rotateY: { duration: 2.4, repeat: Infinity, ease: "linear", delay: 0.55 },
          }}
        >
          <span className="px-3 text-center text-xs font-bold text-emerald-300 sm:text-sm">
            {label}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
