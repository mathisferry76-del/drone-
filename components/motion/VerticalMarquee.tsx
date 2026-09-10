"use client";

import { motion } from "framer-motion";
import Image from "next/image";

// Vertical counterpart to Marquee.tsx: same "render twice, animate 0% to
// ±50%" loop trick, just on the y axis — one column of a multi-column photo
// mosaic background (see LifestyleMosaicBackground).
export default function VerticalMarquee({
  images,
  duration,
  reverse = false,
}: {
  images: string[];
  duration: number;
  reverse?: boolean;
}) {
  return (
    <div className="h-full w-full overflow-hidden">
      <motion.div
        className="flex w-full flex-col gap-3"
        animate={{ y: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      >
        {[...images, ...images].map((src, i) => (
          <div key={i} className="relative aspect-[3/4] w-full shrink-0 overflow-hidden rounded-xl">
            <Image src={src} alt="" fill sizes="25vw" className="object-cover" />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
