"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { categories, type Category } from "@/lib/products";
import { cn } from "@/lib/utils";

const sortOptions = [
  { value: "popularite", label: "Popularité" },
  { value: "nouveautes", label: "Nouveautés" },
  { value: "prix-asc", label: "Prix croissant" },
  { value: "prix-desc", label: "Prix décroissant" },
];

export function BoutiqueFilters({
  activeCategory,
  activeSort,
  resultCount,
}: {
  activeCategory?: Category;
  activeSort: string;
  resultCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "popularite") {
      params.delete("tri");
    } else {
      params.set("tri", value);
    }
    router.push(`/boutique?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer par catégorie">
        <Link
          href="/boutique"
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
            !activeCategory
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-foreground hover:bg-muted"
          )}
        >
          Tous
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/boutique?categorie=${c.slug}`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              activeCategory === c.slug
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-foreground hover:bg-muted"
            )}
            aria-current={activeCategory === c.slug ? "true" : undefined}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {resultCount} résultat{resultCount > 1 ? "s" : ""}
        </p>
        <label htmlFor="sort" className="sr-only">
          Trier par
        </label>
        <select
          id="sort"
          value={activeSort}
          onChange={(e) => updateSort(e.target.value)}
          className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
