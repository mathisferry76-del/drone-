"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Infinite horizontal scroll of a repeated item list. Renders the items
 * twice back-to-back and animates a translateX loop from 0 to -50%, so the
 * seam between the two copies is invisible.
 */
export default function Marquee({
  items,
  className,
}: {
  items: ReactNode[];
  className?: string;
}) {
  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <motion.div
        className="flex w-max items-center gap-10"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      >
        {[...items, ...items].map((item, i) => (
          <span key={i} className="shrink-0">
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
