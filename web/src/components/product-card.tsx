"use client";

import Link from "next/link";
import { Star, ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/products";
import { DroneIllustration } from "@/components/drone-illustration";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { cn, formatPrice } from "@/lib/utils";

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const lowStock = product.stock > 0 && product.stock <= 8;

  return (
    <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      <Link
        href={`/produits/${product.slug}`}
        className="relative block aspect-4/3 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ backgroundColor: `${product.accent}0d` }}
      >
        <DroneIllustration
          variant={product.variant}
          accent={product.accent}
          className="h-full w-full p-4"
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {product.badge && <Badge variant="accent">{product.badge}</Badge>}
          {lowStock && <Badge variant="destructive">Stock limité</Badge>}
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <Link
          href={`/produits/${product.slug}`}
          className="font-heading text-base font-semibold leading-snug text-foreground hover:text-accent"
        >
          {product.name}
        </Link>
        <p className="text-sm text-muted-foreground">{product.tagline}</p>

        <div className="mt-auto flex items-center gap-1.5 pt-1 text-sm">
          <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
          <span className="font-medium text-foreground">{product.rating}</span>
          <span className="text-muted-foreground">({product.reviewCount})</span>
        </div>

        <div className="flex items-baseline gap-2 pt-1">
          <span className="font-heading text-lg font-bold text-foreground">
            {formatPrice(product.price)}
          </span>
          {product.compareAtPrice && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.compareAtPrice)}
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-2 p-4 pt-0">
        <Button
          size="sm"
          variant="accent"
          className={cn("w-full")}
          disabled={product.stock === 0}
          onClick={() => addItem(product.slug)}
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          {product.stock === 0 ? "Épuisé" : "Ajouter au panier"}
        </Button>
      </CardFooter>
    </Card>
  );
}
