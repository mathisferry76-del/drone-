"use client";

import { useState } from "react";

const CATEGORIES = ["Avis", "Suggestion", "Bug", "Autre"] as const;

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Avis");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, category, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur inconnue.");
        setStatus("error");
        return;
      }
      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setError("Impossible de contacter le serveur.");
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Avis, suggestion ou bug ?</h1>
      <p className="mt-2 text-zinc-400">
        Un mot sur ton expérience, une idée d&apos;amélioration, un problème
        rencontré ? Écris-nous ici, ça arrive directement dans notre boîte.
      </p>

      {status === "sent" ? (
        <div className="mt-8 rounded-xl border border-emerald-800/40 bg-emerald-400/5 p-6 text-emerald-300">
          Message envoyé, merci ! On te répond dès que possible.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Ton prénom (optionnel)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mathis"
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Ton email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">Pour qu&apos;on puisse te répondre.</p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              De quoi s&apos;agit-il ?
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    category === c
                      ? "border-yellow-400 bg-yellow-400 text-black"
                      : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Ton message
            </label>
            <textarea
              required
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Décris ton avis, ton idée ou le problème rencontré..."
              className="mt-1.5 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-yellow-400 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-yellow-400 px-6 py-3 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-60"
          >
            {status === "sending" ? "Envoi..." : "Envoyer"}
          </button>
        </form>
      )}
    </div>
  );
}
