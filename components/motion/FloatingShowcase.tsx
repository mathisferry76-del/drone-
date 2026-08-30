"use client";

import Image from "next/image";
import { motion } from "framer-motion";

/**
 * A floating "browser window" mockup around an example thumbnail, used in
 * the hero to give an immediate, tangible sense of the product instead of
 * just describing it in text. The slow bob keeps it feeling alive without
 * being distracting.
 */
export default function FloatingShowcase({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: [0, -14, 0], scale: 1 }}
      transition={{
        opacity: { duration: 0.7, delay: 0.5 },
        scale: { duration: 0.7, delay: 0.5 },
        y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.2 },
      }}
      className="relative mx-auto mt-14 w-full max-w-3xl"
    >
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(ellipse_at_center,theme(colors.yellow.400/25%),transparent_70%)] blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/90 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
          <div className="mx-auto flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-[11px] text-zinc-400">
            <span className="text-emerald-400">🔒</span> min-ia.fr/generate
          </div>
        </div>
        <div className="relative aspect-video w-full">
          <Image
            src={src}
            alt={alt}
            fill
            sizes="(min-width: 768px) 48rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
      </div>
    </motion.div>
  );
}
