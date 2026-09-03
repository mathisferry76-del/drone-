"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface FaqItem {
  q: string;
  a: string;
}

// One-open-at-a-time accordion instead of a static wall of nine always-open
// answers — reads as far less flat/dense, and the expand/collapse motion
// gives the page a bit of the interactivity it was missing outside the hero.
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mt-10 space-y-3">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={item.q}
            className={`overflow-hidden rounded-xl border transition-colors ${
              isOpen ? "border-yellow-400/40 bg-yellow-400/5" : "border-zinc-800 bg-zinc-900/40"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 p-5 text-left"
            >
              <h3 className="font-bold text-zinc-100">{item.q}</h3>
              <motion.span
                animate={{ rotate: isOpen ? 45 : 0 }}
                transition={{ duration: 0.25 }}
                className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-lg font-bold ${
                  isOpen ? "bg-yellow-400 text-black" : "border border-zinc-600 text-zinc-400"
                }`}
              >
                +
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-sm text-zinc-400">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
