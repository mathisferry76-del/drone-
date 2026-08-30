"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09 },
  },
};

const word: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

/**
 * Splits plain-text children on whitespace and reveals each word in a
 * staggered cascade on mount. Non-text children (e.g. the gradient <span>)
 * are passed through as a single animated unit instead of being split.
 */
export default function HeroTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const parts = Array.isArray(children) ? children : [children];
  const items = parts.flatMap((part, i) =>
    typeof part === "string"
      ? part
          .split(/(\s+)/)
          .filter((s) => s.length > 0)
          .map((s, j) => ({ key: `${i}-${j}`, node: s }))
      : [{ key: `${i}-node`, node: part }]
  );

  return (
    <motion.h1
      className={className}
      variants={container}
      initial="hidden"
      animate="show"
    >
      {items.map(({ key, node }) =>
        typeof node === "string" && node.trim() === "" ? (
          node
        ) : (
          <motion.span key={key} variants={word} className="inline-block">
            {node}
          </motion.span>
        )
      )}
    </motion.h1>
  );
}
