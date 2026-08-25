import Link from "next/link";
import { PRESETS } from "@/lib/presets";

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-20 pt-24 text-center">
        <span className="mb-4 rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Fait pour les créateurs solo
        </span>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          Des miniatures qui font{" "}
          <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            cliquer
          </span>
          , générées en 10 secondes
        </h1>
        <p className="mt-6 max-w-xl text-lg text-zinc-400">
          Upload une photo, choisis un style, ajoute ton titre. ThumbAI génère
          une miniature optimisée pour le CTR, dans ton propre style — sans
          designer, sans Photoshop.
        </p>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/generate"
            className="rounded-full bg-yellow-400 px-8 py-3 text-base font-bold text-black transition hover:bg-yellow-300"
          >
            Créer ma première miniature
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-zinc-700 px-8 py-3 text-base font-semibold text-white transition hover:border-zinc-500"
          >
            Voir les tarifs
          </Link>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          3 miniatures gratuites, sans carte bancaire.
        </p>
      </section>

      <section id="styles" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          4 styles prêts à l&apos;emploi
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Chaque style ajuste automatiquement les couleurs, le contraste et la
          typographie pour matcher ton type de contenu.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
            >
              <div
                className="mb-4 h-24 w-full rounded-lg"
                style={{
                  background: `linear-gradient(135deg, ${preset.strokeColor}, ${preset.textColor})`,
                }}
              />
              <h3 className="font-bold">{preset.name}</h3>
              <p className="mt-1 text-sm text-zinc-400">{preset.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <div className="text-3xl font-extrabold text-yellow-400">1</div>
            <h3 className="mt-2 font-bold">Upload ta photo</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Une photo de toi, de ton setup ou de ton sujet — n&apos;importe
              quelle image de départ.
            </p>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-yellow-400">2</div>
            <h3 className="mt-2 font-bold">Choisis un style + un titre</h3>
            <p className="mt-1 text-sm text-zinc-400">
              4 styles calibrés pour le CTR, tu ajoutes juste ton texte
              d&apos;accroche.
            </p>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-yellow-400">3</div>
            <h3 className="mt-2 font-bold">Télécharge en HD</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Export 1280x720 prêt pour YouTube, TikTok ou Reels en un clic.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Prêt à arrêter de perdre 30 minutes par miniature ?
        </h2>
        <Link
          href="/generate"
          className="mt-6 inline-block rounded-full bg-yellow-400 px-8 py-3 text-base font-bold text-black transition hover:bg-yellow-300"
        >
          Essayer gratuitement
        </Link>
      </section>
    </div>
  );
}
