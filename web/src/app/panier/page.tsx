"use client";

import Link from "next/link";
import { Minus, Plus, X, ArrowRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { DroneIllustration } from "@/components/drone-illustration";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";

const FREE_SHIPPING_THRESHOLD = 15000;
const SHIPPING_COST = 690;

export default function CartPage() {
  const { lines, subtotal, isLoaded, setQuantity, removeItem, count } = useCart();

  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = subtotal + shipping;

  if (!isLoaded) {
    return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8" aria-hidden="true" />;
  }

  if (count === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShoppingBag className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-heading text-2xl font-bold">Votre panier est vide</h1>
        <p className="mt-2 max-w-sm text-muted-foreground">
          Parcourez notre boutique pour trouver le drone qu&apos;il vous faut.
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="font-heading text-3xl font-bold">Votre panier</h1>
      <p className="mt-1 text-muted-foreground">
        {count} article{count > 1 ? "s" : ""}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <ul className="flex flex-col gap-4 lg:col-span-2">
          {lines.map(({ product, quantity, lineTotal }) => (
            <li
              key={product.slug}
              className="flex gap-4 rounded-lg border border-border p-4"
            >
              <Link
                href={`/produits/${product.slug}`}
                className="h-24 w-24 shrink-0 rounded-md"
                style={{ backgroundColor: `${product.accent}0d` }}
              >
                <DroneIllustration
                  variant={product.variant}
                  accent={product.accent}
                  className="h-full w-full p-2"
                />
              </Link>

              <div className="flex flex-1 flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/produits/${product.slug}`}
                      className="font-heading text-sm font-semibold hover:text-accent sm:text-base"
                    >
                      {product.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatPrice(product.price)} / unité
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => removeItem(product.slug)}
                    aria-label={`Retirer ${product.name} du panier`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center rounded-md border border-input">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center hover:bg-muted disabled:opacity-40"
                      onClick={() => setQuantity(product.slug, quantity - 1)}
                      disabled={quantity <= 1}
                      aria-label={`Diminuer la quantité de ${product.name}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center hover:bg-muted disabled:opacity-40"
                      onClick={() => setQuantity(product.slug, quantity + 1)}
                      disabled={quantity >= product.stock}
                      aria-label={`Augmenter la quantité de ${product.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="font-heading text-sm font-semibold sm:text-base">
                    {formatPrice(lineTotal)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="h-fit rounded-lg border border-border p-6">
          <h2 className="font-heading text-lg font-semibold">Résumé de la commande</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd className="font-medium">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Livraison</dt>
              <dd className="font-medium">
                {shipping === 0 ? "Offerte" : formatPrice(shipping)}
              </dd>
            </div>
            {shipping > 0 && (
              <p className="text-xs text-muted-foreground">
                Livraison offerte dès {formatPrice(FREE_SHIPPING_THRESHOLD)} d&apos;achat
              </p>
            )}
          </dl>
          <Separator className="my-4" />
          <div className="flex justify-between">
            <span className="font-heading font-semibold">Total</span>
            <span className="font-heading text-lg font-bold">{formatPrice(total)}</span>
          </div>
          <Button asChild size="lg" variant="accent" className="mt-6 w-full">
            <Link href="/commande">
              Passer la commande
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </Button>
          <Link
            href="/boutique"
            className="mt-3 block text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Continuer mes achats
          </Link>
        </div>
      </div>
    </div>
  );
}
