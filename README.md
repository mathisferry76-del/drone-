# ThumbAI — générateur de miniatures pour créateurs

MVP fonctionnel d'un SaaS qui génère des miniatures YouTube/TikTok/Reels
optimisées pour le clic à partir d'une photo, d'un style et d'un titre.
Construit comme point de départ pour valider l'idée avant d'investir plus,
conformément à la démarche discutée : petit produit qui résout un workflow
complet, pas une liste de features.

## Ce qui fonctionne réellement (testé)

- **Landing page** (`/`) : proposition de valeur, 4 styles, CTA.
- **`/generate`** : upload d'une photo, choix d'un style, saisie d'un titre,
  génération et téléchargement en HD (1280x720), avec un quota de 3
  générations gratuites par appareil (filigrane sur le plan gratuit).
- **`/api/generate`** : pipeline d'image réel avec `sharp` — recadrage
  16:9, ajustement couleur/contraste par style, overlay de texte en gras
  avec contour (rendu SVG), dégradé de lisibilité, filigrane conditionnel.
  Testé avec de vraies requêtes, voir capture ci-dessous.
- **`/pricing`** : 3 paliers (Free / Creator 19€ / Pro 39€) avec CTA
  connectés à Stripe Checkout.
- **`/api/checkout`** : crée une session Stripe Checkout en mode
  abonnement. Sans clé Stripe configurée, renvoie un message clair au lieu
  de planter.

## Ce qui est volontairement absent (limites connues du MVP)

Pour rester dans l'esprit "workflow complet minimal", certaines choses ne
sont **pas** implémentées et devront l'être avant un vrai lancement payant :

- **Pas de compte utilisateur ni de base de données.** Le statut "payant"
  est simulé côté client (`localStorage`) après un retour Stripe réussi —
  ça suffit pour démontrer le produit, mais ce n'est pas sécurisé pour de
  vrais abonnements (n'importe qui peut se mettre `isPro=true` dans la
  console du navigateur). Avant de vendre, il faut : une table
  utilisateurs (Supabase/Postgres), un webhook Stripe qui écrit le statut
  d'abonnement en base, et une vérification serveur du quota/statut à
  chaque génération.
- **Pas d'amélioration IA du fond d'image** (le plan Pro la mentionne en
  "beta") — le pipeline actuel est 100% déterministe (`sharp`), rapide et
  gratuit à faire tourner. Une vraie génération/édition IA (ex. API
  OpenAI Images) peut être ajoutée dans `app/api/generate/route.ts` mais
  ajoute coût et latence par génération, donc à ne faire qu'après
  validation de la demande.
- **Pas de tests automatisés.**

## Lancer le projet en local

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000). Aucune variable
d'environnement n'est nécessaire pour utiliser le générateur — il
fonctionne "out of the box".

## Variables d'environnement (optionnelles, pour activer Stripe)

Copie `.env.example` en `.env.local` et renseigne :

```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PRICE_CREATOR=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
```

1. Crée un compte Stripe (mode test), crée deux produits récurrents
   (Creator 19€/mois, Pro 39€/mois), récupère leurs `price_id`.
2. Colle `STRIPE_SECRET_KEY` (clé secrète du dashboard Stripe test) et les
   deux `price_id` ci-dessus.
3. Redémarre `npm run dev` — les boutons de la page `/pricing` redirigent
   alors vers un vrai Stripe Checkout en mode test.

Sans ces variables, `/pricing` reste utilisable mais affiche un message
"non configuré" au clic sur un plan payant, au lieu de planter.

## Déploiement

Le projet est un Next.js standard (App Router), déployable tel quel sur
Vercel :

```bash
vercel deploy
```

Pense à configurer les mêmes variables d'environnement sur Vercel.

## Prochaines étapes pour viser 30k€ MRR (le plan, pas juste le code)

Le code n'est que l'étape 3 du plan complet. Rappel de ce qui compte le
plus, dans l'ordre :

1. **Valider avant de pousser plus loin.** Utilise ce MVP sur tes propres
   contenus, montre le résultat à ton audience, et propose-le en DM à
   10-15 créateurs. Objectif : 5-10 personnes prêtes à payer, avant
   d'investir dans la base de données/auth/facturation réelle.
2. **Si validé, sécuriser la facturation** : ajouter une vraie base
   utilisateurs + webhook Stripe (`checkout.session.completed`,
   `customer.subscription.deleted`) pour que le statut payant soit vérifié
   côté serveur, pas simulé côté client.
3. **Premiers clients payants** via ta distribution existante (audience) +
   démarchage direct de créateurs identifiés à l'étape 1 — pas de pub
   payante tant que le pitch et le prix ne sont pas éprouvés en 1-to-1.
4. **Itérer sur les styles** en fonction des retours réels plutôt que
   d'ajouter des features à l'aveugle.

## Structure du projet

```
app/
  page.tsx              landing page
  pricing/page.tsx       page tarifs + intégration Stripe Checkout
  generate/page.tsx      dashboard : upload, style, génération, téléchargement
  api/generate/route.ts  pipeline sharp (crop, filtre, texte, filigrane)
  api/checkout/route.ts  création de session Stripe Checkout
lib/
  presets.ts              définition des 4 styles + grille tarifaire
  stripe.ts               client Stripe (lazy, tolère l'absence de clé)
components/
  Navbar.tsx, Footer.tsx
```
