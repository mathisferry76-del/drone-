import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Check, ChevronRight } from "lucide-react";
import { DroneIllustration } from "@/components/drone-illustration";
import { ProductCard } from "@/components/product-card";
import { AddToCartPanel } from "@/components/add-to-cart-panel";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getProduct, getRelated, getCategory, products } from "@/lib/products";
import { formatPrice } from "@/lib/utils";

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const related = getRelated(product);
  const category = getCategory(product.category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Fil d'ariane">
        <Link href="/boutique" className="hover:text-foreground">
          Boutique
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href={`/boutique?categorie=${product.category}`} className="hover:text-foreground">
          {category?.label}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
        <div
          className="relative flex aspect-4/3 items-center justify-center rounded-xl border border-border"
          style={{ backgroundColor: `${product.accent}0d` }}
        >
          <DroneIllustration
            variant={product.variant}
            accent={product.accent}
            className="h-full w-full p-8"
          />
          {product.badge && (
            <Badge variant="accent" className="absolute left-4 top-4">
              {product.badge}
            </Badge>
          )}
        </div>

        <div>
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">{product.name}</h1>
          <p className="mt-2 text-lg text-muted-foreground">{product.tagline}</p>

          <div className="mt-4 flex items-center gap-2 text-sm">
            <div className="flex gap-0.5" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < Math.round(product.rating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-border"
                  }`}
                />
              ))}
            </div>
            <span className="font-medium text-foreground">{product.rating}/5</span>
            <span className="text-muted-foreground">({product.reviewCount} avis)</span>
          </div>

          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-heading text-3xl font-bold">
              {formatPrice(product.price)}
            </span>
            {product.compareAtPrice && (
              <span className="text-lg text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.stock > 8
              ? "En stock, expédié sous 24h"
              : product.stock > 0
                ? `Plus que ${product.stock} en stock`
                : "Actuellement indisponible"}
          </p>

          <Separator className="my-6" />

          <AddToCartPanel product={product} />

          <ul className="mt-6 space-y-2.5">
            {product.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>{h}</span>
              </li>
            ))}
          </ul>

          <Separator className="my-6" />

          <h2 className="font-heading text-lg font-semibold">Description</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          <h2 className="mt-6 font-heading text-lg font-semibold">Caractéristiques</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-2">
            {product.specs.map((s) => (
              <div key={s.label} className="rounded-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="mt-0.5 text-sm font-semibold text-foreground">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="font-heading text-2xl font-bold">Vous aimerez aussi</h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <ProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
