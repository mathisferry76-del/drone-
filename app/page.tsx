import Image from "next/image";
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
          10 styles prêts à l&apos;emploi
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Chaque style ajuste automatiquement les couleurs, le contraste et la
          typographie pour matcher ton type de contenu.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRESETS.map((preset) => (
            <div
              key={preset.id}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50"
            >
              <div className="relative aspect-video w-full">
                <Image
                  src={`/examples/${preset.id}.webp`}
                  alt={`Exemple de miniature générée avec le style ${preset.name}`}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="font-bold">{preset.name}</h3>
                <p className="mt-1 text-sm text-zinc-400">{preset.description}</p>
              </div>
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
              10 styles calibrés pour le CTR, tu ajoutes juste ton texte
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

      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Filtre ou IA générative : deux façons de traiter ta photo
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="font-bold">🎨 Styles filtres (tous les plans)</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Recadrage automatique, ajustement des couleurs et du contraste,
              texte impactant avec fond lisible. Rapide, gratuit à générer,
              disponible dès l&apos;offre gratuite, en illimité dès Creator.
            </p>
          </div>
          <div className="rounded-2xl border border-yellow-800/40 bg-yellow-400/5 p-6">
            <h3 className="font-bold">✨ IA générative (Creator &amp; Pro)</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Ta photo est envoyée à un modèle d&apos;IA générative qui
              retravaille réellement l&apos;éclairage, l&apos;ambiance et le
              décor — un rendu qu&apos;un simple filtre de couleur ne peut
              pas produire, tout en gardant ton sujet reconnaissable. Incluse
              à raison de 2 générations/mois en Creator, illimitée en Pro.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Questions fréquentes
        </h2>
        <div className="mt-10 space-y-6">
          <div>
            <h3 className="font-bold">Est-ce que ça marche avec n&apos;importe quelle photo ?</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Oui — portrait, capture d&apos;écran, photo de setup. L&apos;outil
              recadre automatiquement en 1280x720 (le format standard
              YouTube/miniature).
            </p>
          </div>
          <div>
            <h3 className="font-bold">
              Quelle différence avec Canva ou Photoshop ?
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              Pas de mise en page à faire à la main : tu choisis un style,
              tu tapes ton titre, c&apos;est généré en quelques secondes. Les
              plans Creator et Pro vont plus loin avec une IA générative qui
              retravaille l&apos;image elle-même, pas seulement le texte
              par-dessus.
            </p>
          </div>
          <div>
            <h3 className="font-bold">Combien de temps prend une génération ?</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Quelques secondes pour un style filtre. Avec l&apos;amélioration
              IA (Creator/Pro), compte 10 à 20 secondes, le temps que le
              modèle génératif retravaille l&apos;image.
            </p>
          </div>
          <div>
            <h3 className="font-bold">Je peux annuler à tout moment ?</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Oui, les abonnements Creator et Pro sont sans engagement,
              résiliables à tout moment depuis Stripe.
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
