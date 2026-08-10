import type { Metadata } from "next";
import { Suspense } from "react";
import { ProductCard } from "@/components/product-card";
import { BoutiqueFilters } from "@/components/boutique-filters";
import { products, categories, type Category } from "@/lib/products";

export const metadata: Metadata = {
  title: "Boutique",
  description:
    "Tous nos drones : loisir, caméra, FPV et professionnel. Filtrez par catégorie et triez par prix ou popularité.",
};

function isCategory(value: string | undefined): value is Category {
  return !!value && categories.some((c) => c.slug === value);
}

export default async function BoutiquePage({
  searchParams,
}: {
  searchParams: Promise<{ categorie?: string; tri?: string }>;
}) {
  const params = await searchParams;
  const activeCategory = isCategory(params.categorie) ? params.categorie : undefined;
  const activeSort = params.tri ?? "popularite";

  const list = activeCategory
    ? products.filter((p) => p.category === activeCategory)
    : [...products];

  switch (activeSort) {
    case "prix-asc":
      list.sort((a, b) => a.price - b.price);
      break;
    case "prix-desc":
      list.sort((a, b) => b.price - a.price);
      break;
    case "nouveautes":
      list.sort((a, b) => (b.badge === "Nouveau" ? 1 : 0) - (a.badge === "Nouveau" ? 1 : 0));
      break;
    default:
      list.sort((a, b) => b.reviewCount - a.reviewCount);
  }

  const categoryInfo = activeCategory
    ? categories.find((c) => c.slug === activeCategory)
    : undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">
          {categoryInfo ? categoryInfo.label : "Tous nos drones"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {categoryInfo
            ? categoryInfo.description
            : "Loisir, caméra, FPV et professionnel — trouvez le drone adapté à votre projet."}
        </p>
      </div>

      <div className="mt-8">
        <Suspense fallback={<div className="h-16 border-b border-border" />}>
          <BoutiqueFilters
            activeCategory={activeCategory}
            activeSort={activeSort}
            resultCount={list.length}
          />
        </Suspense>
      </div>

      {list.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">
          Aucun drone ne correspond à cette sélection pour le moment.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
