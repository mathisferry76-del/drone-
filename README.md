# ThumbAI — générateur de miniatures pour créateurs

MVP fonctionnel d'un SaaS qui génère des miniatures YouTube/TikTok/Reels
optimisées pour le clic à partir d'une photo, d'un style et d'un titre.
Construit comme point de départ pour valider l'idée avant d'investir plus,
conformément à la démarche discutée : petit produit qui résout un workflow
complet, pas une liste de features.

## Ce qui fonctionne réellement (testé)

- **Landing page** (`/`) : proposition de valeur, 10 styles, une section
  "Nos résultats" (galerie d'exemples de miniatures générées), une FAQ de
  8 questions, un menu (desktop + menu hamburger mobile) avec Styles,
  Résultats, Tarifs, FAQ et Contact, et un footer avec adresse de contact.
- **`/generate`** : un vrai petit éditeur multi-calques, pas juste "une
  photo + un titre" :
  - **Jusqu'à 5 calques de texte** indépendants (titre, sous-titre, badge
    promo...), chacun avec sa propre couleur, couleur de contour, fond
    (panneau/ombre portée/aucun), taille, courbure — et une position
    définie en glissant directement son marqueur sur l'aperçu photo.
  - **Jusqu'à 8 formes/annotations** (flèche, cercle de mise en avant,
    rectangle) avec couleur/taille/rotation, positionnées de la même
    façon par glisser-déposer.
  - **Réglages avancés** : luminosité/contraste/saturation ajustables
    finement en plus du curseur d'intensité du style, vignette
    (assombrissement des bords), cadre bordure avec couleur au choix.
  - Génération et téléchargement en HD (1280x720), quota de 3 générations
    gratuites par appareil (filigrane sur le plan gratuit).
- **`/api/generate`** : pipeline d'image réel avec `sharp` pour le fond
  (recadrage 16:9, ajustement couleur/contraste par style) et un moteur de
  rendu maison au-dessus pour le texte (`opentype.js`, glyphe par glyphe,
  y compris le rendu courbé le long d'un arc, plusieurs calques
  indépendants) et les formes (SVG généré à la volée) — testé avec de
  vraies requêtes combinant plusieurs calques de texte, formes, vignette
  et cadre en une seule génération, voir captures.
- **`/pricing`** : 3 paliers (Free / Creator 19€ / Pro 39€) avec CTA
  connectés à Stripe Checkout, et une section qui explique concrètement la
  différence entre les offres (volume vs IA générative).
- **`/api/checkout`** : crée une session Stripe Checkout en mode
  abonnement. Sans clé Stripe configurée, renvoie un message clair au lieu
  de planter.
- **Amélioration IA générative (Creator & Pro)** : un toggle dans
  `/generate` envoie la photo à l'API OpenAI (`gpt-image-1`,
  `images.edit`) qui retravaille réellement l'éclairage/l'ambiance/le
  décor, au lieu d'un filtre de couleur déterministe — avec un champ de
  description libre pour préciser ce qu'on veut voir. Creator a droit à
  2 générations IA par mois, Pro est illimité. Côté serveur, sans
  `OPENAI_API_KEY` configurée, l'appel renvoie une erreur 501 claire (et
  les erreurs OpenAI réelles — clé invalide, org non vérifiée, quota —
  remontent avec un message actionnable) au lieu de planter.
- **Style "Réaliste (sans filtre)"** : aucun grading couleur (photo
  inchangée) ; son prompt IA vise le photoréalisme maximal plutôt qu'un
  style artistique.
- **Jusqu'à 3 images de référence pour l'IA** : en mode IA, on peut
  ajouter jusqu'à 3 photos (logo, objet...) qu'OpenAI reçoit en plus de la
  photo principale, guidées par le champ description ("ajoute le logo de
  la première image en haut à droite").
- **`input_fidelity: "high"`** sur l'appel `images.edit` d'OpenAI : demande
  explicitement au modèle de conserver au maximum les traits du sujet
  (visage en particulier) au lieu de le réinterpréter librement — ce
  paramètre est à `"low"` par défaut côté OpenAI.
- **Zone "visage à préserver" verrouillée pixel par pixel** : en mode IA,
  un marqueur ellipse apparaît sur l'aperçu (centré par défaut, déplaçable,
  et redimensionnable **indépendamment en largeur et en hauteur**) que
  l'utilisateur positionne sur son visage. Côté serveur, cette zone devient
  un vrai masque PNG (transparence = zone que l'IA peut modifier, opaque =
  zone préservée telle quelle) envoyé à `images.edit` — le visage revient
  donc identique pixel pour pixel, garantie qu'aucune instruction de
  prompt seule ne peut donner. Combiné à `input_fidelity: "high"` pour la
  zone de transition (cheveux, oreilles) qui reste éditable.
- **Retouche gratuite et instantanée après une génération IA** : le
  serveur renvoie l'image brute générée par OpenAI (avant texte/formes) en
  plus du rendu final. Le client la garde en cache tant que la photo, le
  style, la description IA, les images de référence et la zone visage ne
  changent pas — un nouveau clic sur "Générer" ne fait alors que
  recomposer localement le texte/les formes/les couleurs par-dessus, sans
  ré-appeler OpenAI (donc gratuit, instantané, et ça ne consomme pas le
  quota IA du plan Creator). Dès qu'un de ces éléments change, une vraie
  nouvelle génération IA (payante) repart.
- **Réglages de couleur (luminosité/contraste/saturation) utilisables même
  en mode IA** : appliqués en post-traitement sur le résultat généré, pour
  corriger une IA repartie sur des couleurs trop saturées sans avoir à
  relancer une génération.

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
- **L'amélioration IA générative facture réellement OpenAI** à chaque
  génération (le modèle `gpt-image-1` n'est pas gratuit) — contrairement
  aux styles filtres qui ne coûtent rien à faire tourner. Le prix du plan
  Pro doit couvrir ce coût variable ; à surveiller une fois en usage réel.
- **Le quota de 2 générations IA/mois pour Creator n'est pas non plus
  vérifié côté serveur** — même limitation que le statut payant ci-dessus :
  le compteur vit dans `localStorage`, donc contournable en vidant le
  cache. Se corrige avec la même vraie base de données que le statut
  d'abonnement.
- **Pas de ré-édition après export.** Le positionnement/couleurs/courbure
  se règlent avant de cliquer "Générer" (sur la photo, pas sur le résultat
  déjà aplati en PNG) — on ne peut pas rouvrir une miniature téléchargée
  pour déplacer un élément après coup. Le faire proprement demanderait de
  garder chaque génération comme calque éditable plutôt qu'une image
  aplatie, une architecture différente (un vrai éditeur canvas) — à
  envisager plus tard si la demande le justifie, pas dans ce MVP.
- **Pas de tests automatisés.**

## Lancer le projet en local

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000). Les styles filtres
fonctionnent "out of the box", sans aucune variable d'environnement.
L'amélioration IA (Pro) nécessite `OPENAI_API_KEY` (voir plus bas).

## Variables d'environnement (optionnelles)

Copie `.env.example` en `.env.local` et renseigne ce dont tu as besoin :

```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PRICE_CREATOR=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
OPENAI_API_KEY=sk-...
```

**Stripe** (pour activer le paiement) :
1. Crée un compte Stripe (mode test), crée deux produits récurrents
   (Creator 19€/mois, Pro 39€/mois), récupère leurs `price_id`.
2. Colle `STRIPE_SECRET_KEY` (clé secrète du dashboard Stripe test) et les
   deux `price_id` ci-dessus.
3. Redémarre `npm run dev` — les boutons de la page `/pricing` redirigent
   alors vers un vrai Stripe Checkout en mode test.

Sans ces variables, `/pricing` reste utilisable mais affiche un message
"non configuré" au clic sur un plan payant, au lieu de planter.

**OpenAI** (pour activer l'amélioration IA générative, plan Pro) :
1. Crée une clé API sur [platform.openai.com](https://platform.openai.com/api-keys)
   et assure-toi que le compte a accès au modèle `gpt-image-1`.
2. Colle-la dans `OPENAI_API_KEY`.
3. Redémarre `npm run dev` — le toggle "Amélioration IA" dans `/generate`
   (visible seulement en simulant un compte Pro, voir ci-dessous) appelle
   alors vraiment l'API.

Sans cette clé, l'appel renvoie une erreur claire (501) au lieu de
planter — le reste du produit (styles filtres) continue de fonctionner
normalement.

**Tester le plan Pro sans Stripe configuré** : dans la console du
navigateur sur `/generate`, exécute
`localStorage.setItem('thumbai_plan', 'pro')` puis recharge la page.

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
