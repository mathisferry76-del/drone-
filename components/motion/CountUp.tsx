"use client";

import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Animates from 0 up to `value` once it scrolls into view — a small "live
 * dashboard" touch for the stat callouts instead of a static number.
 */
export default function CountUp({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);
  // Safety net: on some layouts (e.g. a reflow from an async-mounted sibling
  // shifting this element right as the observer attaches) the IntersectionObserver
  // can miss its one shot at firing, leaving the counter stuck at 0 forever
  // since `once: true` never gets a second chance. Force it after a short
  // delay so a missed observer callback never means a permanently wrong stat.
  const [forceView, setForceView] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setForceView(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!inView && !forceView) return;
    const controls = animate(motionValue, value, { duration: 1.2, ease: "easeOut" });
    const unsubscribe = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [inView, forceView, value, motionValue, rounded]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
