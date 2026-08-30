"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect } from "react";

/**
 * A soft light that follows the cursor around the page — a common
 * "futuristic SaaS" touch. Fixed and pointer-events:none so it never
 * interferes with clicks; springs toward the pointer instead of snapping
 * to it for a smoother, more premium feel. No-op on touch devices since
 * there's no mousemove to track there.
 */
export default function CursorGlow() {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const springX = useSpring(x, { stiffness: 60, damping: 20, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 60, damping: 20, mass: 0.5 });

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      x.set(e.clientX);
      y.set(e.clientY);
    }
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [x, y]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-30 hidden h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,theme(colors.yellow.400/7%),transparent_70%)] md:block"
      style={{ x: springX, y: springY }}
    />
  );
}
