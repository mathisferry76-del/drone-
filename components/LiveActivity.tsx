"use client";

import { useEffect, useState } from "react";

type Kind = "generation" | "pack" | "subscription";
type Event = { kind: Kind; secondsAgo: number; pseudo: string | null };
type ActivePromo = { code: string; expiresAt: string; threshold: number };
type Milestone = { step: number; next: number; activePromo: ActivePromo | null };

const SUFFIXES: Record<Kind, string> = {
  generation: "vient de générer une photo ✨",
  pack: "vient d'acheter un pack de crédits 🎉",
  subscription: "vient de s'abonner 🚀",
};

// pseudo is an already-masked label from the webhook (e.g. "ma***76", see
// lib/mask-email.ts) — generation events never carry one (no email lookup
// there), so those still fall back to the generic "Quelqu'un".
function labelFor(event: Event): string {
  return `${event.pseudo ?? "Quelqu'un"} ${SUFFIXES[event.kind]}`;
}

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
  const [today, setToday] = useState<number | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/activity");
        if (!res.ok) return;
        const data: { total?: number; today?: number; recent?: Event[]; milestone?: Milestone } = await res.json();
        if (cancelled) return;
        if (typeof data.total === "number") setTotal(data.total);
        if (typeof data.today === "number") setToday(data.today);
        if (data.milestone) setMilestone(data.milestone);
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

  return { events, total, today, milestone };
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
      {labelFor(event)}
    </div>
  );
}

function formatCountdown(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}min`;
  return `${hours}h${minutes.toString().padStart(2, "0")}`;
}

// "Mode objectif" (demande explicite) : tous les MILESTONE_STEP générations
// réelles (voir lib/growth-milestones.ts), un vrai code Stripe -10% valable
// 24h est créé côté serveur — ce composant se contente de l'afficher tant
// qu'il est actif, sinon montre la progression vers le prochain palier.
// Jamais de countdown ou de "code" fictif : sans activePromo renvoyé par
// l'API, rien ne s'affiche à part la barre de progression.
export function MilestonePromoBanner({ className }: { className?: string }) {
  const { total, milestone } = useRecentActivity();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  const activePromo = milestone?.activePromo ?? null;

  useEffect(() => {
    if (!activePromo) return;
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, [activePromo]);

  if (total === null || milestone === null) return null;

  if (activePromo) {
    const msRemaining = new Date(activePromo.expiresAt).getTime() - now;
    if (msRemaining <= 0) return null;

    async function copyCode() {
      if (!activePromo) return;
      try {
        await navigator.clipboard.writeText(activePromo.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard access can be denied — the code is still visible to copy by hand.
      }
    }

    return (
      <div className={`rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm ${className ?? ""}`}>
        <p className="text-emerald-300">
          🎉 Objectif <span className="font-bold">{activePromo.threshold}</span> générations atteint !
          Code <span className="font-bold">-10%</span> sur tout, encore{" "}
          <span className="font-bold">{formatCountdown(msRemaining)}</span>.
        </p>
        <button
          onClick={copyCode}
          className="mt-2 rounded-full border border-emerald-400/60 px-3 py-1 font-mono font-bold text-emerald-300 transition hover:bg-emerald-400/10"
        >
          {copied ? "Copié !" : activePromo.code}
        </button>
      </div>
    );
  }

  const progress = Math.min(1, Math.max(0, (total - (milestone.next - milestone.step)) / milestone.step));

  return (
    <div className={`text-xs text-zinc-500 ${className ?? ""}`}>
      <p>
        Encore <span className="font-bold text-zinc-300">{milestone.next - total}</span> générations avant un code{" "}
        <span className="font-bold text-zinc-300">-10%</span> valable 24h pour tout le monde
      </p>
      <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}

export function GenerationsCounter({ className }: { className?: string }) {
  const { total, today } = useRecentActivity();
  if (total === null || total <= 0) return null;

  return (
    <span className={className}>
      <span className="font-bold text-white">{total.toLocaleString("fr-FR")}</span> photos/vidéos
      générées avec MIN IA
      {today !== null && today > 0 && (
        <>
          {" "}
          · <span className="font-bold text-white">{today.toLocaleString("fr-FR")}</span> aujourd&apos;hui
        </>
      )}
    </span>
  );
}
