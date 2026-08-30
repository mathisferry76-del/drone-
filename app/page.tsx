import Image from "next/image";
import Link from "next/link";
import { PRESETS } from "@/lib/presets";
import FadeInSection from "@/components/motion/FadeInSection";
import HeroTitle from "@/components/motion/HeroTitle";
import FloatingShowcase from "@/components/motion/FloatingShowcase";
import Marquee from "@/components/motion/Marquee";
import TiltCard from "@/components/motion/TiltCard";
import CountUp from "@/components/motion/CountUp";

const RESULTS = [
  { id: "bold-impact", niche: "Gaming / réaction", span: "sm:row-span-2" },
  { id: "neon-pop", niche: "Musique / clip", span: "" },
  { id: "high-contrast-drama", niche: "Actu / débat", span: "" },
  { id: "golden-vacation", niche: "Voyage / lifestyle", span: "" },
  { id: "cyberpunk", niche: "Tech / gadgets", span: "sm:row-span-2" },
  { id: "nature-vive", niche: "Outdoor / vlog", span: "" },
  { id: "clean-minimal", niche: "Podcast / interview", span: "" },
  { id: "retro-vintage", niche: "Culture / rétro", span: "" },
];

const FAQS = [
  {
    q: "Est-ce que ça marche avec n'importe quelle photo ?",
    a: "Oui — portrait, capture d'écran, photo de setup. L'outil recadre automatiquement en 1280x720 (le format standard YouTube/miniature).",
  },
  {
    q: "Quelle différence avec Canva ou Photoshop ?",
    a: "Pas de mise en page à faire à la main : tu choisis un style, tu tapes ton titre, c'est généré en quelques secondes. Tous les plans incluent aussi une IA générative qui retravaille l'image elle-même, pas seulement le texte par-dessus.",
  },
  {
    q: "Quelle IA utilisez-vous pour générer les images ?",
    a: "On utilise le modèle gpt-image-1 d'OpenAI (pas Gemini/nano-banana de Google). Il retravaille l'éclairage, l'ambiance et le décor de ta photo tout en préservant tes traits, avec un réglage de fidélité poussé au maximum pour que tu restes reconnaissable.",
  },
  {
    q: "Combien de temps prend une génération ?",
    a: "Quelques secondes pour un style filtre. Avec l'amélioration IA, compte 10 à 20 secondes, le temps que le modèle génératif retravaille l'image.",
  },
  {
    q: "Y a-t-il un essai gratuit ?",
    a: "Oui — 1 génération IA gratuite par compte, avec un léger filigrane (le téléchargement HD nécessite un abonnement). Au-delà, chaque génération IA a un vrai coût de calcul, donc un abonnement est nécessaire pour continuer.",
  },
  {
    q: "Je peux ajouter plusieurs textes, flèches ou cercles sur ma miniature ?",
    a: "Oui — l'éditeur permet jusqu'à 5 calques de texte indépendants et 8 formes/annotations (flèche, cercle, rectangle), chacun positionné par glisser-déposer directement sur ta photo.",
  },
  {
    q: "Je peux utiliser plusieurs photos de référence pour l'IA ?",
    a: "Oui, jusqu'à 3 images de référence en plus de ta photo principale (un logo, un objet, une ambiance à reproduire), que tu peux guider avec le champ de description.",
  },
  {
    q: "Je peux annuler à tout moment ?",
    a: "Oui, tous les abonnements sont sans engagement, résiliables à tout moment depuis Stripe.",
  },
  {
    q: "Mes photos sont-elles gardées ou utilisées pour autre chose ?",
    a: "Tes photos servent uniquement à générer ta miniature. Pour le mode IA, l'image transite par l'API d'OpenAI le temps du traitement, conformément à leur politique — on ne les revend ni ne les réutilise pour autre chose.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden">
        <div aria-hidden className="sci-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem]" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[32rem] bg-[radial-gradient(ellipse_at_top,theme(colors.yellow.400/18%),transparent_65%)] [animation:drift-glow_14s_ease-in-out_infinite]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 h-[28rem] bg-[radial-gradient(ellipse_at_top,theme(colors.orange.500/12%),transparent_60%)] [animation:drift-glow-alt_18s_ease-in-out_infinite]"
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-20 pt-24 text-center">
          <span className="mb-4 rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Fait pour les créateurs solo
          </span>
          <HeroTitle className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Plus de vues sur tes vidéos, avec{" "}
            <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
              zéro compétence design
            </span>
          </HeroTitle>
          <p className="mt-6 max-w-xl text-lg text-zinc-400">
            Upload une photo, choisis un style, ajoute ton titre. MIN IA
            génère en 10 secondes une miniature optimisée pour le clic —
            sans designer, sans Photoshop, sans passer 30 minutes sur
            Canva.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/generate"
              className="rounded-full bg-yellow-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.yellow.400)] transition hover:scale-105 hover:bg-yellow-300"
            >
              Créer ma première miniature →
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-zinc-700 px-8 py-3 text-base font-semibold text-white transition hover:scale-105 hover:border-zinc-500"
            >
              Voir les tarifs
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Résiliable en 1 clic
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Sans engagement de durée
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Paiement sécurisé (Stripe)
            </span>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-zinc-500">
            <span><CountUp value={10} className="font-bold text-white" /> styles prêts à l&apos;emploi</span>
            <span className="hidden h-4 w-px bg-zinc-800 sm:block" />
            <span><CountUp value={5} className="font-bold text-white" /> calques de texte + formes</span>
            <span className="hidden h-4 w-px bg-zinc-800 sm:block" />
            <span>IA générative <span className="font-bold text-white">gpt-image-1</span></span>
          </div>

          <FloatingShowcase
            src="/examples/bold-impact.webp"
            alt="Aperçu d'une miniature générée avec MIN IA"
          />
        </div>
      </section>

      <div className="border-y border-zinc-900 bg-zinc-950/60 py-4">
        <Marquee
          className="text-sm font-semibold uppercase tracking-wide text-zinc-600"
          items={PRESETS.map((p) => (
            <span key={p.id} className="flex items-center gap-2">
              {p.name} <span className="text-yellow-400/50">✦</span>
            </span>
          ))}
        />
      </div>

      <FadeInSection id="styles" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          10 styles prêts à l&apos;emploi
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Chaque style ajuste automatiquement les couleurs, le contraste et la
          typographie pour matcher ton type de contenu.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRESETS.map((preset) => (
            <TiltCard key={preset.id} className="group">
              <div className="holo-border overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 transition hover:border-zinc-700 hover:shadow-[0_0_30px_-12px_theme(colors.yellow.400/40%)]">
                <div className="relative aspect-video w-full overflow-hidden">
                  <Image
                    src={`/examples/${preset.id}.webp`}
                    alt={`Exemple de miniature générée avec le style ${preset.name}`}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <h3 className="font-bold">{preset.name}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{preset.description}</p>
                </div>
              </div>
            </TiltCard>
          ))}
        </div>
      </FadeInSection>

      <FadeInSection className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          De la photo brute à la miniature qui capte le clic
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Pas besoin d&apos;être designer : MIN IA fait le travail de
          retouche, de mise en page et de texte à ta place, en quelques
          secondes.
        </p>
        <div className="mt-10 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center">
            <div className="mx-auto flex aspect-video w-full items-center justify-center rounded-xl bg-zinc-800/60">
              <span className="text-4xl">📷</span>
            </div>
            <p className="mt-4 text-sm font-semibold text-zinc-500">
              Ta photo, telle quelle
            </p>
          </div>
          <div className="text-2xl font-bold text-yellow-400 sm:rotate-0">→</div>
          <div className="overflow-hidden rounded-2xl border border-yellow-400/40 bg-yellow-400/5">
            <div className="relative aspect-video w-full">
              <Image
                src="/examples/bold-impact.webp"
                alt="Exemple de miniature générée avec MIN IA"
                fill
                sizes="(min-width: 640px) 40vw, 100vw"
                className="object-cover"
              />
            </div>
            <p className="py-3 text-center text-sm font-bold text-yellow-400">
              Miniature prête en ~10 secondes
            </p>
          </div>
        </div>
      </FadeInSection>

      <FadeInSection id="resultats" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Nos résultats
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Un aperçu de miniatures générées avec MIN IA, sur différentes
          thématiques de chaîne.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-4 sm:auto-rows-[9rem]">
          {RESULTS.map((r) => (
            <div
              key={r.id}
              className={`group relative overflow-hidden rounded-2xl border border-zinc-800 ${r.span}`}
            >
              <Image
                src={`/examples/${r.id}.webp`}
                alt={`Miniature générée avec MIN IA — style ${r.niche}`}
                fill
                sizes="(min-width: 640px) 25vw, 100vw"
                className="object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                <span className="text-xs font-semibold text-white">{r.niche}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-zinc-500">
          Envie du même résultat sur tes vidéos ?{" "}
          <Link href="/pricing" className="font-semibold text-yellow-400 hover:text-yellow-300">
            Voir les plans →
          </Link>
        </p>
      </FadeInSection>

      <FadeInSection className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800/60 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-400/40 text-lg font-extrabold text-yellow-400">
              1
            </div>
            <h3 className="mt-4 font-bold">Upload ta photo</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Une photo de toi, de ton setup ou de ton sujet — n&apos;importe
              quelle image de départ.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800/60 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-400/40 text-lg font-extrabold text-yellow-400">
              2
            </div>
            <h3 className="mt-4 font-bold">Choisis un style + un titre</h3>
            <p className="mt-1 text-sm text-zinc-400">
              10 styles calibrés pour le CTR, tu ajoutes juste ton texte
              d&apos;accroche.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800/60 p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-400/40 text-lg font-extrabold text-yellow-400">
              3
            </div>
            <h3 className="mt-4 font-bold">Télécharge en HD</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Export 1280x720 prêt pour YouTube, TikTok ou Reels en un clic.
            </p>
          </div>
        </div>
      </FadeInSection>

      <FadeInSection className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Filtre ou IA générative : deux façons de traiter ta photo
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="font-bold">🎨 Styles filtres (tous les plans)</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Recadrage automatique, ajustement des couleurs et du contraste,
              texte impactant avec fond lisible. Illimité et sans filigrane
              sur tous les plans.
            </p>
          </div>
          <div className="rounded-2xl border border-yellow-800/40 bg-yellow-400/5 p-6">
            <h3 className="font-bold">✨ IA générative (tous les plans)</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Ta photo est envoyée à un modèle d&apos;IA générative qui
              retravaille réellement l&apos;éclairage, l&apos;ambiance et le
              décor — un rendu qu&apos;un simple filtre de couleur ne peut
              pas produire, tout en gardant ton sujet reconnaissable. Un
              quota mensuel de générations est inclus dans chaque plan, plus
              grand sur les plans supérieurs.
            </p>
          </div>
        </div>
      </FadeInSection>

      <FadeInSection id="faq" className="mx-auto w-full max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Questions fréquentes
        </h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <h3 className="font-bold text-zinc-100">{item.q}</h3>
              <p className="mt-2 text-sm text-zinc-400">{item.a}</p>
            </div>
          ))}
        </div>
      </FadeInSection>

      <FadeInSection className="mx-auto w-full max-w-4xl px-6 py-20 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">
          Prêt à arrêter de perdre 30 minutes par miniature ?
        </h2>
        <Link
          href="/pricing"
          className="mt-6 inline-block rounded-full bg-yellow-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.yellow.400)] transition hover:bg-yellow-300"
        >
          Voir les plans
        </Link>
      </FadeInSection>
    </div>
  );
}
