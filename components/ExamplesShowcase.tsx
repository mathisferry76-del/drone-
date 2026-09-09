"use client";

import { useState } from "react";
import Image from "next/image";

export interface ShowcaseExample {
  id: string;
  kind: "image" | "video";
  before: string;
  after: string;
  badge: string;
  title: string;
  caption: string;
}

// Mirrors the "avant/après" showcase pattern from competitor landing pages
// (toggle between the two states of the SAME example, a button to cycle to
// a different example entirely) rather than a static side-by-side grid —
// keeps one large, high-impact result on screen at a time instead of
// diluting attention across a wall of thumbnails.
export default function ExamplesShowcase({ examples }: { examples: ShowcaseExample[] }) {
  const [index, setIndex] = useState(0);
  // Defaults to "après" first, like the reference: the transformed result is
  // the whole point of this section, "avant" is the toggle-away state.
  const [showAfter, setShowAfter] = useState(true);

  if (examples.length === 0) return null;
  const example = examples[index];
  const src = showAfter ? example.after : example.before;

  function nextExample() {
    setIndex((i) => (i + 1) % examples.length);
    setShowAfter(true);
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setShowAfter(false)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            !showAfter
              ? "bg-zinc-100 text-black"
              : "border border-zinc-700 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          Avant
        </button>
        <button
          type="button"
          onClick={() => setShowAfter(true)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            showAfter
              ? "bg-emerald-400 text-black"
              : "border border-zinc-700 text-zinc-400 hover:border-zinc-500"
          }`}
        >
          Après
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
        {showAfter && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-emerald-400 px-3 py-1 text-xs font-bold text-black shadow-[0_0_20px_-4px_theme(colors.emerald.400)]">
            ✨ ULTRA-RÉALISTE
          </span>
        )}
        <div className="relative aspect-[9/16] w-full bg-black">
          {example.kind === "video" ? (
            // key forces a fresh <video> element on src change, otherwise
            // some browsers keep showing the previous clip's last frame.
            <video
              key={src}
              src={src}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <Image
              key={src}
              src={src}
              alt={example.title}
              fill
              sizes="(min-width: 640px) 28rem, 100vw"
              className="object-cover"
            />
          )}
        </div>
        <div className="bg-gradient-to-t from-black/90 to-transparent p-4">
          <h3 className="font-bold text-white">{example.title} ✨</h3>
          <p className="mt-1 text-sm text-zinc-400">{example.caption}</p>
        </div>
      </div>

      {examples.length > 1 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={nextExample}
            className="text-sm font-semibold uppercase tracking-wide text-zinc-500 underline-offset-4 transition hover:text-zinc-300 hover:underline"
          >
            Voir plus d&apos;exemples
          </button>
        </div>
      )}
    </div>
  );
}
