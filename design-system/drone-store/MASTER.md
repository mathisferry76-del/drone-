# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/drone-store/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** SkyForge Drones (e-commerce)
**Stack:** Next.js (App Router) + Tailwind CSS v4 + hand-built shadcn-style primitives
**Updated:** 2026-08-10

> Note: the `ui-ux-pro-max --design-system` search for "drone e-commerce" fuzzy-matched
> to a pharmacy/App-Store-landing preset that didn't fit a drone retailer. This file
> documents the **actual, deliberately chosen** system used to build the site — a
> synthesis of the tool's `style`/`color`/`typography`/`landing` domain searches
> (tech-dark, automotive/IoT palettes, "Tech Startup" font pairing, "Product Demo +
> Features" landing pattern) plus manual judgment. Treat this file, not the tool's
> raw `--design-system` output, as source of truth.

---

## Global Rules

### Color Palette

Light-mode e-commerce UI with a dark "hero" band (sky/flight/tech feel) reused for
CTA banners and the "À propos" intro.

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Background | `#F8FAFC` | `--background` |
| Foreground | `#0F172A` | `--foreground` |
| Card | `#FFFFFF` | `--card` |
| Muted | `#EEF2F6` | `--muted` |
| Muted foreground | `#64748B` | `--muted-foreground` |
| Border | `#E2E8F0` | `--border` |
| Primary (nav/buttons) | `#0F172A` | `--primary` |
| Accent / CTA | `#0EA5E9` (sky-500) | `--accent` |
| Success | `#16A34A` | `--success` |
| Destructive | `#DC2626` | `--destructive` |
| Ring | `#0EA5E9` | `--ring` |
| Hero background | `#0B1220` → `#131C2E` | `--hero`, `--hero-elevated` |
| Hero accent | `#38BDF8` (sky-400) | `--hero-accent` |

Category accent tints (used on product illustrations/cards, not global tokens):
loisir/caméra = `#0ea5e9` / `#38bdf8` (sky), FPV = `#f97316` (orange), pro = `#16a34a` (green).

### Typography

- **Heading font:** Space Grotesk (500/600/700)
- **Body font:** DM Sans (400/500/700)
- **Mood:** tech, modern, bold — matches "Tech Startup" pairing from the typography domain search
- Loaded via `next/font/google` in `src/app/layout.tsx` as `--font-space-grotesk` / `--font-dm-sans`,
  exposed as Tailwind utilities `font-heading` / `font-sans` through `@theme inline` in `globals.css`.

### Spacing & Radius

Standard Tailwind v4 scale, no custom overrides. Card/button radius: `--radius: 0.75rem`
(`rounded-lg` ≈ 12px), matching the "modern tech e-commerce" feel (not sharp/brutalist,
not fully pill-shaped).

---

## Component Specs

Hand-built shadcn-style primitives (no remote registry dependency — `shadcn init` failed
to reach `ui.shadcn.com` in this environment) live in `src/components/ui/`:
`button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `label.tsx`, `separator.tsx`,
built with `class-variance-authority` + `@radix-ui/react-slot` (for `asChild`), styled via `cn()`
(`clsx` + `tailwind-merge`) in `src/lib/utils.ts`.

- **Buttons:** `h-11` default / `h-13` lg / `h-9` sm, `rounded-md`, variants
  `default | accent | outline | ghost | link | destructive`. Accent = filled sky-500, used for
  every primary purchase CTA ("Ajouter au panier", "Passer la commande", "Confirmer la commande").
- **Cards:** `rounded-lg border border-border bg-card shadow-sm`, used for product cards,
  spec tiles, testimonials, checkout summary panel.
- **Badges:** pill, `accent` (Nouveau/Best-seller), `destructive` (Stock limité), `success`.

### Product imagery

No stock photography or external image hosts are used. `src/components/drone-illustration.tsx`
renders a deterministic flat-SVG quadcopter/hexacopter per product (`variant` × `accent` props),
avoiding CLS/broken-image risk and giving the catalog a consistent, branded look instead of
generic stock photos.

---

## Style Guidelines

**Style:** Clean tech e-commerce — light surfaces, dark "hero" accents, sky-blue CTAs,
soft shadows, no gradients/glassmorphism/neon (rejected the tool's raw "Vibrant & Block-based"
and "Cyberpunk" style matches as unfit for a retail catalog that needs fast scanning and
legible product specs).

**Key effects:** 150–300ms transitions on hover/focus, `prefers-reduced-motion` respected
globally in `globals.css`, no decorative-only animation.

### Page Pattern

Landing = hero (dark, value prop + trust stats) → category grid → featured products
(best-sellers) → "why us" trust features → testimonials → dark CTA banner → footer
(trust points + newsletter). Product listing = filter pills + sort select + responsive
grid. Product detail = image panel + buy box + specs + related products.

---

## Anti-Patterns (Do NOT Use)

- ❌ Emojis as icons — use `lucide-react` (already the icon set in use)
- ❌ Missing `cursor-pointer` on clickable elements
- ❌ Low contrast text — maintain 4.5:1 minimum
- ❌ Instant state changes — always transition 150–300ms
- ❌ Invisible focus states — every interactive element needs a visible focus ring
  (`focus-visible:ring-2 focus-visible:ring-ring`)
- ❌ Stock photography / external image CDNs for product imagery — use `DroneIllustration`

---

## Pre-Delivery Checklist

- [x] No emojis used as icons
- [x] Consistent icon set (lucide-react)
- [x] `cursor-pointer` on all clickable elements (built into the `Button` variants)
- [x] Hover/focus transitions 150–300ms
- [x] Light mode text contrast ≥ 4.5:1
- [x] Focus states visible for keyboard nav
- [x] `prefers-reduced-motion` respected (global rule in `globals.css`)
- [x] Responsive at 375/768/1024/1440px (verified via Playwright screenshots + manual review)
- [x] No content hidden behind the sticky navbar
- [x] No horizontal scroll on mobile
