"use client";

import { useEffect, useState } from "react";

type Kind = "generation" | "pack" | "subscription";
type Event = { kind: Kind; secondsAgo: number };

const LABELS: Record<Kind, string> = {
  generation: "Quelqu'un vient de générer une photo ✨",
  pack: "Quelqu'un vient d'acheter un pack de crédits 🎉",
  subscription: "Quelqu'un vient de s'abonner 🚀",
};

// Real data only, from /api/activity — no fabricated events. Presenting
// fake purchase/usage activity as real is a deceptive commercial practice
// under French/EU consumer law (and the kind of dark pattern the FTC and
// France's DGCCRF have actually fined companies over), so this only ever
// shows something when a genuine event exists — and only recent ones (under
// an hour old), since "vient de" implies real recency, not "at some point".
// No toast at all when nothing qualifies, rather than stretching an old
// event to look current.
function useRecentActivity() {
  const [events, setEvents] = useState<Event[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/activity");
        if (!res.ok) return;
        const data: { total?: number; recent?: Event[] } = await res.json();
        if (cancelled) return;
        if (typeof data.total === "number") setTotal(data.total);
        setEvents((data.recent ?? []).filter((e) => e.secondsAgo < 3600));
      } catch {
        // Silent — a failed poll just means no toast this cycle, not worth
        // surfacing an error for a purely decorative feature.
      }
    }
    poll();
    const interval = setInterval(poll, 25_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { events, total };
}

export function LiveActivityToast() {
  const { events } = useRecentActivity();
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (events.length === 0) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(hide);
  }, [events, index]);

  useEffect(() => {
    if (events.length === 0) return;
    const cycle = setInterval(() => setIndex((i) => (i + 1) % events.length), 8000);
    return () => clearInterval(cycle);
  }, [events]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!visible || events.length === 0) return null;
  const event = events[index % events.length];

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-xs rounded-xl border border-zinc-800 bg-zinc-900/95 px-4 py-3 text-sm text-zinc-200 shadow-lg backdrop-blur transition-opacity">
      {LABELS[event.kind]}
    </div>
  );
}

export function GenerationsCounter({ className }: { className?: string }) {
  const { total } = useRecentActivity();
  if (total === null || total <= 0) return null;

  return (
    <span className={className}>
      <span className="font-bold text-white">{total.toLocaleString("fr-FR")}</span> photos/vidéos
      générées avec MIN IA
    </span>
  );
}
