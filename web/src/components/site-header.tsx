"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { categories } from "@/lib/products";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/boutique", label: "Boutique" },
  ...categories.map((c) => ({
    href: `/boutique?categorie=${c.slug}`,
    label: c.label,
  })),
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const { count, isLoaded } = useCart();
  const pathname = usePathname();

  const [previousPathname, setPreviousPathname] = React.useState(pathname);
  if (pathname !== previousPathname) {
    setPreviousPathname(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-backdrop-blur:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none">
              <circle cx="5" cy="5" r="2.4" fill="currentColor" />
              <circle cx="19" cy="5" r="2.4" fill="currentColor" />
              <circle cx="5" cy="19" r="2.4" fill="currentColor" />
              <circle cx="19" cy="19" r="2.4" fill="currentColor" />
              <path
                d="M5 5L11 12L5 19M19 5L13 12L19 19"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <rect x="9.5" y="10" width="5" height="4" rx="1.2" fill="currentColor" />
            </svg>
          </span>
          SkyForge
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/panier"
            className="relative flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            aria-label={`Panier, ${count} article${count > 1 ? "s" : ""}`}
          >
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {isLoaded && count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-foreground">
                {count}
              </span>
            )}
          </Link>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
            aria-expanded={open}
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <nav
        className={cn(
          "border-t border-border bg-background lg:hidden",
          open ? "block" : "hidden"
        )}
        aria-label="Navigation mobile"
      >
        <ul className="flex flex-col gap-1 px-4 py-3">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
