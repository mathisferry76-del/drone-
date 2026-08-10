import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <p className="font-heading text-6xl font-bold text-accent">404</p>
      <h1 className="mt-4 font-heading text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-muted-foreground">
        Ce drone a décollé sans laisser d&apos;adresse. Retournez à la boutique pour
        continuer votre exploration.
      </p>
      <Button asChild size="lg" variant="accent" className="mt-6">
        <Link href="/boutique">
          Voir la boutique
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
