import Link from "next/link";
import { ArrowRight, Star, Truck, ShieldCheck, Wrench, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product-card";
import { DroneIllustration } from "@/components/drone-illustration";
import { categories, products } from "@/lib/products";

const featured = products.filter((p) =>
  ["aerolite-100", "skyforge-vantage-4k", "raptor-fpv-3", "terrafly-inspect-x6"].includes(
    p.slug
  )
);

const whyUs = [
  {
    icon: Wrench,
    title: "Testés par nos pilotes",
    detail: "Chaque référence est validée en conditions réelles avant sa mise en ligne.",
  },
  {
    icon: ShieldCheck,
    title: "Garantie 2 ans",
    detail: "Sur l'ensemble de la gamme, pièces et main d'œuvre incluses.",
  },
  {
    icon: Truck,
    title: "Livraison 24-48h",
    detail: "Expédition depuis nos entrepôts en France métropolitaine.",
  },
  {
    icon: Wallet,
    title: "Paiement en 3x sans frais",
    detail: "Dès 150 € d'achat, sans dossier ni justificatif.",
  },
];

const testimonials = [
  {
    name: "Camille R.",
    role: "Vidéaste indépendante",
    quote:
      "Le Vantage 4K a remplacé mon ancien setup à 3000€. La stabilisation est bluffante et le SAV a répondu en moins d'une heure.",
    rating: 5,
  },
  {
    name: "Yanis B.",
    role: "Pilote FPV amateur",
    quote:
      "Commandé le Raptor FPV 5\" un lundi, reçu le mercredi. Prêt à voler direct, les réglages usine sont déjà nickel.",
    rating: 5,
  },
  {
    name: "Ferme du Clos Vert",
    role: "Exploitation agricole, 140 ha",
    quote:
      "Le TerraFly Agri Hex nous fait gagner deux jours de traitement par cycle. La formation incluse a été très complète.",
    rating: 4,
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero text-hero-foreground">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60% 50% at 80% 20%, rgba(56,189,248,0.25), transparent), radial-gradient(40% 40% at 10% 80%, rgba(56,189,248,0.12), transparent)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:py-24 lg:px-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-hero-border bg-white/5 px-3 py-1 text-xs font-medium text-hero-accent">
              <Star className="h-3.5 w-3.5 fill-hero-accent" aria-hidden="true" />
              Noté 4.8/5 par plus de 1 200 pilotes
            </span>
            <h1 className="mt-5 font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.25rem]">
              Le drone qu&apos;il vous faut,{" "}
              <span className="text-hero-accent">quel que soit votre terrain</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-hero-muted">
              Loisir, caméra, FPV ou usage professionnel : notre gamme est
              sélectionnée et testée par des pilotes, avec garantie 2 ans et
              livraison en 24-48h.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link href="/boutique">
                  Découvrir la boutique
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-hero-border bg-transparent text-hero-foreground hover:bg-white/10"
              >
                <Link href="/boutique?categorie=pro">Solutions professionnelles</Link>
              </Button>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-hero-border pt-6">
              <div>
                <dt className="text-sm text-hero-muted">Modèles</dt>
                <dd className="font-heading text-2xl font-bold">40+</dd>
              </div>
              <div>
                <dt className="text-sm text-hero-muted">Pilotes livrés</dt>
                <dd className="font-heading text-2xl font-bold">18 000+</dd>
              </div>
              <div>
                <dt className="text-sm text-hero-muted">Garantie</dt>
                <dd className="font-heading text-2xl font-bold">2 ans</dd>
              </div>
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="rounded-2xl border border-hero-border bg-hero-elevated/60 p-6">
              <DroneIllustration variant="hex" accent="#38bdf8" className="w-full" />
            </div>
            <div className="absolute -bottom-4 -left-4 rounded-xl border border-hero-border bg-hero-elevated px-4 py-3 shadow-lg sm:-left-8">
              <p className="text-xs text-hero-muted">Livraison estimée</p>
              <p className="font-heading text-sm font-semibold">Demain avant 18h</p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl font-bold sm:text-3xl">
              Trouvez votre catégorie
            </h2>
            <p className="mt-2 text-muted-foreground">
              Quatre familles de drones, une sélection pensée pour chaque usage.
            </p>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <Link
              key={c.slug}
              href={`/boutique?categorie=${c.slug}`}
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h3 className="font-heading text-lg font-semibold group-hover:text-accent">
                {c.label}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Voir la sélection
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="bg-muted/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-2xl font-bold sm:text-3xl">
                Nos meilleures ventes
              </h2>
              <p className="mt-2 text-muted-foreground">
                Les modèles les plus plébiscités par nos clients ce mois-ci.
              </p>
            </div>
            <Link
              href="/boutique"
              className="hidden shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline sm:inline-flex"
            >
              Toute la boutique
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">
          Pourquoi choisir SkyForge
        </h2>
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {whyUs.map(({ icon: Icon, title, detail }) => (
            <div key={title}>
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-heading text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/40 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-heading text-2xl font-bold sm:text-3xl">
            Ils volent avec nous
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure
                key={t.name}
                className="flex h-full flex-col rounded-lg border border-border bg-card p-6"
              >
                <div className="flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < t.rating ? "fill-amber-400 text-amber-400" : "text-border"
                      }`}
                    />
                  ))}
                </div>
                <blockquote className="mt-3 flex-1 text-sm text-foreground">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-semibold text-foreground">{t.name}</span>
                  <span className="text-muted-foreground"> — {t.role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="bg-hero text-hero-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="font-heading text-2xl font-bold sm:text-3xl">
              Prêt à décoller ?
            </h2>
            <p className="mt-2 max-w-xl text-hero-muted">
              Parcourez notre catalogue complet et trouvez le drone adapté à votre
              prochain projet.
            </p>
          </div>
          <Button asChild size="lg" variant="accent">
            <Link href="/boutique">
              Voir tous les drones
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
