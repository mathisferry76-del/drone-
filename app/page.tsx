import Image from "next/image";
import Link from "next/link";
import { PRESETS } from "@/lib/presets";
import { FORMATS } from "@/lib/formats";
import FadeInSection from "@/components/motion/FadeInSection";
import HeroTitle from "@/components/motion/HeroTitle";
import Marquee from "@/components/motion/Marquee";
import TiltCard from "@/components/motion/TiltCard";
import CountUp from "@/components/motion/CountUp";
import GradientOrb from "@/components/motion/GradientOrb";
import FaqAccordion from "@/components/FaqAccordion";

const RESULT_ACCENTS = [
  { border: "border-yellow-400/30 hover:border-yellow-400/60", tag: "bg-yellow-400 text-black" },
  { border: "border-fuchsia-400/30 hover:border-fuchsia-400/60", tag: "bg-fuchsia-400 text-black" },
  { border: "border-cyan-400/30 hover:border-cyan-400/60", tag: "bg-cyan-400 text-black" },
];

const RESULTS = [
  { id: "high-contrast-drama", niche: "Business / SaaS" },
  { id: "muay-thai-fight", niche: "Sport / combat" },
];

const FLEX_TAGS = [
  "🚗 Voiture de luxe",
  "⌚ Montre",
  "🧥 Nouvelle veste",
  "🏠 Façade maison",
  "🕶️ Nouveau look",
  "🎬 Miniature YouTube",
];

const FLEX_EXAMPLES = [
  { icon: "🚗", label: "Voiture", prompt: "Remplace ma voiture par une Porsche 911 rouge" },
  { icon: "⌚", label: "Montre", prompt: "Ajoute une montre de luxe à mon poignet" },
  { icon: "🏠", label: "Maison", prompt: "Change la façade en pierre blanche moderne" },
  { icon: "🧥", label: "Style", prompt: "Remplace mon t-shirt par une veste en cuir" },
];

const FAQS = [
  {
    q: "Est-ce que ça marche avec n'importe quelle photo ?",
    a: "Oui — portrait, capture d'écran, photo de setup. L'outil recadre automatiquement en 1280x720 (le format standard YouTube/miniature).",
  },
  {
    q: "Quelle différence avec Canva ou Photoshop ?",
    a: "Pas de mise en page à faire à la main : tu choisis un style, tu tapes ton titre, c'est généré en quelques secondes. Une IA générative retravaille aussi l'image elle-même, pas seulement le texte par-dessus.",
  },
  {
    q: "Comment fonctionne la génération par IA ?",
    a: "Notre moteur d'IA générative propriétaire retravaille l'éclairage, l'ambiance et le décor de ta photo tout en préservant tes traits, pour que tu restes reconnaissable.",
  },
  {
    q: "Combien de temps prend une génération ?",
    a: "Quelques secondes pour un style filtre. Avec l'amélioration IA, compte 10 à 20 secondes, le temps que le modèle génératif retravaille l'image.",
  },
  {
    q: "Y a-t-il un essai gratuit ?",
    a: "Oui — 1 génération IA gratuite par compte, avec un léger filigrane (le téléchargement HD nécessite des crédits). Au-delà, chaque génération IA a un vrai coût de calcul, donc des crédits sont nécessaires pour continuer (200 crédits par génération, à partir de 2€).",
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
    a: "Oui, les abonnements sont sans engagement et résiliables à tout moment depuis Stripe — les crédits déjà reçus restent utilisables. Les packs de crédits, eux, sont un achat unique sans rien à annuler.",
  },
  {
    q: "Mes photos sont-elles gardées ou utilisées pour autre chose ?",
    a: "Tes photos servent uniquement à générer ton image. Pour le mode IA, l'image transite le temps du traitement par notre infrastructure et nos prestataires techniques — on ne les revend ni ne les réutilise pour autre chose.",
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
        <GradientOrb
          color="rgba(217,70,239,0.14)"
          className="right-0 top-40 -z-10"
          size="h-[22rem] w-[22rem]"
          variant="drift-glow-alt"
        />
        <GradientOrb
          color="rgba(34,211,238,0.10)"
          className="left-0 top-64 -z-10"
          size="h-[20rem] w-[20rem]"
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-20 pt-24 text-center">
          <span className="mb-4 rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            ✨ Impressionne tes potes
          </span>
          <HeroTitle className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Pretend until you look{" "}
            <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
              real
            </span>
          </HeroTitle>
          <p className="mt-6 max-w-xl text-lg text-zinc-400">
            Ta voiture, ta montre, ta maison... décris UN seul changement,
            l&apos;IA l&apos;applique en 10 secondes sans toucher au reste de
            la photo. Résultat ultra-réaliste, pas un effet IA qui se voit.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/impress"
              className="rounded-full bg-yellow-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.yellow.400)] transition hover:scale-105 hover:bg-yellow-300"
            >
              Essayer avec ma photo →
            </Link>
            <Link
              href="/generate"
              className="rounded-full border border-zinc-700 px-8 py-3 text-base font-semibold text-white transition hover:scale-105 hover:border-zinc-500"
            >
              Je veux des miniatures YouTube
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Résiliable en 1 clic
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Crédits sans date d&apos;expiration
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-emerald-400">✓</span> Paiement sécurisé (Stripe)
            </span>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-zinc-500">
            <span>Résultat en <CountUp value={10} className="font-bold text-white" />s</span>
            <span className="hidden h-4 w-px bg-zinc-800 sm:block" />
            <span>1 seul détail changé, <span className="font-bold text-white">zéro sur-retouche</span></span>
            <span className="hidden h-4 w-px bg-zinc-800 sm:block" />
            <span>IA générative <span className="font-bold text-white">propriétaire</span></span>
          </div>
        </div>
      </section>

      <div className="border-y border-zinc-900 bg-zinc-950/60 py-4">
        <Marquee
          className="text-sm font-semibold uppercase tracking-wide text-zinc-600"
          items={FLEX_TAGS.map((t) => (
            <span key={t} className="flex items-center gap-2">
              {t} <span className="text-yellow-400/50">✦</span>
            </span>
          ))}
        />
      </div>

      <FadeInSection className="relative mx-auto w-full max-w-5xl overflow-hidden px-6 py-16">
        <GradientOrb color="rgba(250,204,21,0.14)" className="left-1/2 top-0 -translate-x-1/2 -z-10" />
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Un détail change, la photo reste crédible
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Décris UN seul changement — l&apos;IA l&apos;applique sans toucher
          au reste : même lumière, mêmes ombres, même cadrage. Pas de
          sur-retouche, pas d&apos;effet « généré par IA ».
        </p>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {FLEX_EXAMPLES.map((ex) => (
            <TiltCard key={ex.label}>
              <div className="flex h-full flex-col items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-center transition hover:border-yellow-400/40">
                <span className="text-4xl">{ex.icon}</span>
                <h3 className="font-bold">{ex.label}</h3>
                <p className="text-xs text-zinc-500">&quot;{ex.prompt}&quot;</p>
              </div>
            </TiltCard>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <Link
            href="/impress"
            className="rounded-full bg-yellow-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.yellow.400)] transition hover:scale-105 hover:bg-yellow-300"
          >
            Essayer avec ma photo →
          </Link>
        </div>
      </FadeInSection>

      <FadeInSection className="mx-auto w-full max-w-3xl px-6 pt-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Tu es créateur de contenu ?
        </p>
        <h2 className="mt-2 text-xl font-bold sm:text-2xl">
          MIN IA fait aussi tes miniatures YouTube
        </h2>
      </FadeInSection>

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

      <FadeInSection className="relative mx-auto w-full max-w-5xl overflow-hidden px-6 py-16">
        <GradientOrb
          color="rgba(217,70,239,0.14)"
          className="-left-40 top-10 -z-10"
          variant="drift-glow-alt"
        />
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          De la photo brute à la miniature qui capte le clic
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Pas besoin d&apos;être designer : MIN IA fait le travail de
          retouche, de mise en page et de texte à ta place, en quelques
          secondes.
        </p>
      </FadeInSection>

      <FadeInSection id="resultats" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Nos résultats
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          Un aperçu de ce que MIN IA peut créer, sur différents styles et
          thématiques.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {RESULTS.map((r, i) => {
            const accent = RESULT_ACCENTS[i % RESULT_ACCENTS.length];
            return (
              <div
                key={r.id}
                className={`group relative aspect-video overflow-hidden rounded-2xl border transition-colors ${accent.border}`}
              >
                <Image
                  src={`/examples/${r.id}.webp`}
                  alt={`Création générée avec MIN IA — style ${r.niche}`}
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${accent.tag}`}>
                    {r.niche}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center text-sm text-zinc-500">
          Envie du même résultat sur tes propres photos ?{" "}
          <Link href="/generate" className="font-semibold text-yellow-400 hover:text-yellow-300">
            Essayer maintenant →
          </Link>
        </p>
      </FadeInSection>

      <FadeInSection className="relative mx-auto w-full max-w-5xl overflow-hidden px-6 py-16">
        <GradientOrb color="rgba(6,182,212,0.12)" className="right-0 top-0 -z-10" />
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {[
            {
              n: "1",
              grad: "from-yellow-400 to-orange-500",
              title: "Upload ta photo",
              body: "Une photo de toi, de ton setup ou de ton sujet — n'importe quelle image de départ.",
            },
            {
              n: "2",
              grad: "from-orange-500 to-fuchsia-500",
              title: "Choisis un format + un style",
              body: "YouTube, Shorts, TikTok, Instagram... et un style calibré pour le CTR — tu ajoutes juste ton texte d'accroche.",
            },
            {
              n: "3",
              grad: "from-fuchsia-500 to-cyan-400",
              title: "Télécharge en HD",
              body: "Export dans le bon format et la bonne résolution, prêt à publier en un clic.",
            },
          ].map((step) => (
            <TiltCard key={step.n}>
              <div className="group h-full rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-6 transition hover:border-zinc-700">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-lg font-extrabold text-black shadow-[0_0_25px_-6px_rgba(250,204,21,0.5)] ${step.grad}`}
                >
                  {step.n}
                </div>
                <h3 className="mt-4 font-bold">{step.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{step.body}</p>
              </div>
            </TiltCard>
          ))}
        </div>
      </FadeInSection>

      <FadeInSection className="mx-auto w-full max-w-5xl px-6 py-10">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Un seul outil, tous les formats
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {FORMATS.map((f, i) => (
            <span
              key={f.id}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition hover:scale-105 ${
                i % 3 === 0
                  ? "border-yellow-400/30 text-yellow-300"
                  : i % 3 === 1
                    ? "border-fuchsia-400/30 text-fuchsia-300"
                    : "border-cyan-400/30 text-cyan-300"
              }`}
            >
              {f.label}
            </span>
          ))}
        </div>
      </FadeInSection>

      <FadeInSection className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Filtre ou IA générative : deux façons de traiter ta photo
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <TiltCard>
            <div className="h-full rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-2xl">
                🎨
              </div>
              <h3 className="mt-4 font-bold">Styles filtres (tous les plans)</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Recadrage automatique, ajustement des couleurs et du
                contraste, texte impactant avec fond lisible. Illimité et
                sans filigrane sur tous les plans.
              </p>
            </div>
          </TiltCard>
          <TiltCard>
            <div className="holo-border h-full rounded-2xl border border-yellow-800/40 bg-yellow-400/5 p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/10 text-2xl">
                ✨
              </div>
              <h3 className="mt-4 font-bold">IA générative (tous les plans)</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Ta photo est envoyée à un modèle d&apos;IA générative qui
                retravaille réellement l&apos;éclairage, l&apos;ambiance et le
                décor — un rendu qu&apos;un simple filtre de couleur ne peut
                pas produire, tout en gardant ton sujet reconnaissable. Un
                quota mensuel de générations est inclus dans chaque plan, plus
                grand sur les plans supérieurs.
              </p>
            </div>
          </TiltCard>
        </div>
      </FadeInSection>

      <FadeInSection id="faq" className="mx-auto w-full max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">
          Questions fréquentes
        </h2>
        <FaqAccordion items={FAQS} />
      </FadeInSection>

      <FadeInSection className="relative mx-auto w-full max-w-4xl overflow-hidden px-6 py-20 text-center">
        <GradientOrb
          color="rgba(250,204,21,0.20)"
          className="left-1/2 top-0 -translate-x-1/2 -z-10"
        />
        <GradientOrb
          color="rgba(217,70,239,0.14)"
          className="left-1/2 top-10 -translate-x-1/2 -z-10"
          variant="drift-glow-alt"
        />
        <h2 className="text-2xl font-bold sm:text-3xl">
          Prêt à arrêter de perdre 30 minutes par miniature ?
        </h2>
        <Link
          href="/generate"
          className="mt-6 inline-block rounded-full bg-yellow-400 px-8 py-3 text-base font-bold text-black shadow-[0_0_40px_-8px_theme(colors.yellow.400)] transition hover:scale-105 hover:bg-yellow-300"
        >
          Créer ma miniature
        </Link>
      </FadeInSection>
    </div>
  );
}
