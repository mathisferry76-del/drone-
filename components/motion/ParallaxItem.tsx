"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import type { ReactNode } from "react";

/**
 * Moves its children vertically as the page scrolls past them, at a speed
 * controlled by `strength` (positive floats up while scrolling down,
 * negative floats down) — used to give a grid of cards a "flying"/parallax
 * feel instead of sitting static once revealed.
 */
export default function ParallaxItem({
  children,
  strength = 40,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [strength, -strength]);

  return (
    <motion.div ref={ref} style={{ y }} className={className}>
      {children}
    </motion.div>
  );
}
