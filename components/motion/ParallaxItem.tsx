"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import type { ReactNode } from "react";

/**
 * Moves its children as the page scrolls past them — drifting upward while
 * tumbling and swaying side to side, like a leaf caught in the wind, rather
 * than a flat linear parallax. `spin` sets the rotation direction/amount
 * (negative spins the other way) so neighboring cards can tumble opposite
 * ways for variety.
 */
export default function ParallaxItem({
  children,
  strength = 40,
  spin = 10,
  className,
}: {
  children: ReactNode;
  strength?: number;
  spin?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [strength, -strength]);
  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [spin, spin * -0.3, -spin]);
  const x = useTransform(scrollYProgress, [0, 0.5, 1], [0, spin > 0 ? 14 : -14, 0]);

  return (
    <motion.div ref={ref} style={{ y, x, rotate }} className={className}>
      {children}
    </motion.div>
  );
}
