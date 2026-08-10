import Link from "next/link";
import { categories } from "@/lib/products";
import { NewsletterForm } from "@/components/newsletter-form";
import { Truck, ShieldCheck, Headset, RotateCcw } from "lucide-react";

const trustPoints = [
  { icon: Truck, label: "Livraison en 24-48h", detail: "Partout en France" },
  { icon: ShieldCheck, label: "Garantie 2 ans", detail: "Sur tous les drones" },
  { icon: RotateCcw, label: "Retours 30 jours", detail: "Simples et gratuits" },
  { icon: Headset, label: "SAV francophone", detail: "6j/7 par chat et téléphone" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-1 gap-6 border-b border-border pb-10 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="font-heading text-lg font-bold">SkyForge</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Drones grand public et professionnels, sélectionnés et testés par des
              pilotes passionnés.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Boutique</p>
            <ul className="mt-3 space-y-2">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/boutique?categorie=${c.slug}`}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Aide</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/a-propos" className="text-sm text-muted-foreground hover:text-foreground">
                  À propos
                </Link>
              </li>
              <li>
                <Link href="/panier" className="text-sm text-muted-foreground hover:text-foreground">
                  Mon panier
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">Newsletter</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Nouveautés et offres, une fois par mois. Pas de spam.
            </p>
            <NewsletterForm />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SkyForge Drones. Tous droits réservés.</p>
          <p>Site de démonstration — aucune commande réelle n&apos;est traitée.</p>
        </div>
      </div>
    </footer>
  );
}
