"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ArrowLeft } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";

const FREE_SHIPPING_THRESHOLD = 15000;
const SHIPPING_COST = 690;

export default function CheckoutPage() {
  const { lines, subtotal, count, clear, isLoaded } = useCart();
  const [status, setStatus] = React.useState<"form" | "success">("form");
  const [orderNumber, setOrderNumber] = React.useState("");

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = subtotal + shipping;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOrderNumber(`SF-${Math.floor(100000 + Math.random() * 900000)}`);
    setStatus("success");
    clear();
  }

  if (!isLoaded) {
    return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-hidden="true" />;
  }

  if (status === "success") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-heading text-2xl font-bold sm:text-3xl">
          Commande confirmée
        </h1>
        <p className="mt-2 text-muted-foreground">
          Merci pour votre commande <span className="font-semibold text-foreground">{orderNumber}</span>.
          Un e-mail de confirmation vient de vous être envoyé.
        </p>
        <p className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Ceci est un site de démonstration — aucun paiement réel n&apos;a été prélevé et
          aucun drone ne sera expédié.
        </p>
        <Button asChild size="lg" variant="accent" className="mt-8">
          <Link href="/boutique">
            Continuer mes achats
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <h1 className="font-heading text-2xl font-bold">Votre panier est vide</h1>
        <p className="mt-2 text-muted-foreground">
          Ajoutez un drone à votre panier avant de passer commande.
        </p>
        <Button asChild size="lg" variant="accent" className="mt-6">
          <Link href="/boutique">Voir la boutique</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/panier"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour au panier
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-bold">Finaliser la commande</h1>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <form onSubmit={handleSubmit} className="flex flex-col gap-8 lg:col-span-2">
          <fieldset className="flex flex-col gap-4">
            <legend className="font-heading text-lg font-semibold">Coordonnées</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">Prénom</Label>
                <Input id="firstName" name="firstName" required autoComplete="given-name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">Nom</Label>
                <Input id="lastName" name="lastName" required autoComplete="family-name" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" name="phone" type="tel" required autoComplete="tel" />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="font-heading text-lg font-semibold">Adresse de livraison</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" name="address" required autoComplete="street-address" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" name="city" required autoComplete="address-level2" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="postalCode">Code postal</Label>
                <Input
                  id="postalCode"
                  name="postalCode"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  autoComplete="postal-code"
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="font-heading text-lg font-semibold">Paiement</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="cardNumber">Numéro de carte</Label>
                <Input
                  id="cardNumber"
                  name="cardNumber"
                  required
                  inputMode="numeric"
                  placeholder="•••• •••• •••• ••••"
                  autoComplete="cc-number"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expiry">Expiration</Label>
                <Input id="expiry" name="expiry" required placeholder="MM/AA" autoComplete="cc-exp" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cvc">CVC</Label>
                <Input
                  id="cvc"
                  name="cvc"
                  required
                  inputMode="numeric"
                  placeholder="•••"
                  autoComplete="cc-csc"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Démonstration uniquement : aucune information de paiement n&apos;est transmise
              ou stockée.
            </p>
          </fieldset>

          <Button type="submit" size="lg" variant="accent" className="w-full sm:w-fit">
            Confirmer la commande — {formatPrice(total)}
          </Button>
        </form>

        <div className="h-fit rounded-lg border border-border p-6">
          <h2 className="font-heading text-lg font-semibold">Votre commande</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {lines.map(({ product, quantity, lineTotal }) => (
              <li key={product.slug} className="flex justify-between gap-3 text-sm">
                <span className="text-foreground">
                  {product.name} <span className="text-muted-foreground">× {quantity}</span>
                </span>
                <span className="shrink-0 font-medium">{formatPrice(lineTotal)}</span>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd className="font-medium">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Livraison</dt>
              <dd className="font-medium">{shipping === 0 ? "Offerte" : formatPrice(shipping)}</dd>
            </div>
          </dl>
          <Separator className="my-4" />
          <div className="flex justify-between">
            <span className="font-heading font-semibold">Total</span>
            <span className="font-heading text-lg font-bold">{formatPrice(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
