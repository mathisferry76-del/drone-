"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import type { Product } from "@/lib/products";

export function AddToCartPanel({ product }: { product: Product }) {
  const [quantity, setQuantity] = React.useState(1);
  const [justAdded, setJustAdded] = React.useState(false);
  const { addItem } = useCart();
  const router = useRouter();

  function handleAdd() {
    addItem(product.slug, quantity);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-md border border-input">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Diminuer la quantité"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-sm font-medium" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
            disabled={quantity >= product.stock}
            aria-label="Augmenter la quantité"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <Button
          size="lg"
          variant="accent"
          className="flex-1"
          disabled={product.stock === 0}
          onClick={handleAdd}
        >
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {product.stock === 0 ? "Épuisé" : "Ajouter au panier"}
        </Button>
      </div>

      {justAdded && (
        <p className="text-sm font-medium text-success" role="status">
          Ajouté au panier !{" "}
          <button
            type="button"
            className="cursor-pointer underline underline-offset-2"
            onClick={() => router.push("/panier")}
          >
            Voir le panier
          </button>
        </p>
      )}
    </div>
  );
}
