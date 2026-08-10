import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Target, Users, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "SkyForge sélectionne et teste des drones loisir, caméra, FPV et professionnels depuis 2019.",
};

const values = [
  {
    icon: Target,
    title: "Sélection exigeante",
    detail:
      "Chaque drone est testé en vol par notre équipe avant d'entrer au catalogue : autonomie réelle, stabilité, qualité vidéo.",
  },
  {
    icon: Users,
    title: "Conseil par des pilotes",
    detail:
      "Notre SAV est composé de pilotes certifiés, pas d'un simple centre d'appels — on vous oriente vers le bon modèle.",
  },
  {
    icon: Leaf,
    title: "Usage responsable",
    detail:
      "Guides de pilotage réglementaire (DGAC) fournis avec chaque commande pour voler en toute légalité.",
  },
];

export default function AboutPage() {
  return (
    <div>
      <section className="bg-hero text-hero-foreground">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">
            Des drones choisis par des pilotes, pour des pilotes
          </h1>
          <p className="mt-4 max-w-2xl text-hero-muted">
            Depuis 2019, SkyForge sélectionne, teste et distribue des drones de loisir,
            de prise de vue, de course et professionnels partout en France.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {values.map(({ icon: Icon, title, detail }) => (
            <div key={title} className="rounded-lg border border-border p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-heading text-base font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="font-heading text-2xl font-bold">Notre histoire</h2>
            <p className="mt-3 text-muted-foreground">
              SkyForge est né du constat que la plupart des boutiques en ligne vendent des
              drones sans jamais les avoir fait voler. Nous avons commencé par un petit
              atelier à Toulouse où chaque référence était testée avant mise en vente — une
              exigence que nous gardons aujourd&apos;hui avec plus de 40 modèles au
              catalogue.
            </p>
            <p className="mt-3 text-muted-foreground">
              Nous accompagnons aussi bien le premier vol d&apos;un débutant que le
              déploiement d&apos;une flotte d&apos;inspection pour un exploitant agricole ou
              une entreprise de BTP.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-6 rounded-lg border border-border p-8">
            <div>
              <dt className="text-sm text-muted-foreground">Fondée en</dt>
              <dd className="font-heading text-2xl font-bold">2019</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Pilotes livrés</dt>
              <dd className="font-heading text-2xl font-bold">18 000+</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Modèles au catalogue</dt>
              <dd className="font-heading text-2xl font-bold">40+</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Note moyenne</dt>
              <dd className="font-heading text-2xl font-bold">4.8/5</dd>
            </div>
          </dl>
        </div>

        <div className="mt-14 flex flex-col items-start gap-4 rounded-lg border border-border bg-muted/40 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-xl font-bold">Une question avant d&apos;acheter ?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Notre équipe vous aide à choisir le bon modèle selon votre usage.
            </p>
          </div>
          <Button asChild size="lg" variant="accent" className="shrink-0">
            <Link href="/contact">
              Nous contacter
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
