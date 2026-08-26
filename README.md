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
- **Retouche ciblée d'une zone précise** : en mode IA, on peut marquer une
  zone (déplaçable/redimensionnable, comme la zone visage) sur un élément
  précis de la photo (couleur trop vive, objet mal placé) et décrire le
  changement voulu. Le serveur construit le masque inverse de celui du
  visage — tout est préservé sauf cette zone — et envoie une seconde
  requête `images.edit` ciblée à OpenAI, en protégeant toujours le visage
  même si la zone le chevauche. C'est un vrai appel IA (facturé, décompté
  du quota Creator), distinct de la retouche texte/couleur gratuite.
- **Comptes utilisateurs, statut payant et quota vérifiés côté serveur
  (Supabase)** : connexion par lien magique (email, sans mot de passe).
  Une fois connecté, le plan (free/creator/pro) et les compteurs de quota
  vivent dans une vraie base Postgres, mis à jour par un webhook Stripe —
  ce n'est plus le `localStorage` du navigateur qui décide. L'IA générative
  nécessite maintenant un compte connecté (elle ne peut plus être débloquée
  en trafiquant le `localStorage`, l'exploit initial du MVP est corrigé).
  Les visiteurs non connectés gardent l'accès libre aux styles filtres
  (3 gratuites par appareil, comme avant) — aucun compte requis pour
  essayer le produit.
- **Historique des miniatures (`/historique`)** : chaque génération faite
  en étant connecté est sauvegardée (Supabase Storage) et réapparaît sur
  n'importe quel appareil — téléchargement et suppression depuis la page.

## Ce qui est volontairement absent (limites connues du MVP)

Pour rester dans l'esprit "workflow complet minimal", certaines choses ne
sont **pas** implémentées et devront l'être avant un vrai lancement payant :

- **Le statut payant et le quota ne sont vérifiés côté serveur que pour les
  utilisateurs connectés.** Un visiteur anonyme reste sur l'ancienne
  simulation `localStorage`, mais elle ne donne accès qu'aux styles
  filtres gratuits — l'IA générative (la fonctionnalité coûteuse) est
  bloquée sans compte réel, donc l'exploit "je me mets `isPro=true` dans
  la console" ne fonctionne plus pour ce qui coûte de l'argent.
- **L'amélioration IA générative facture réellement OpenAI** à chaque
  génération (le modèle `gpt-image-1` n'est pas gratuit) — contrairement
  aux styles filtres qui ne coûtent rien à faire tourner. Le prix du plan
  Pro doit couvrir ce coût variable ; à surveiller une fois en usage réel.
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
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PRICE_CREATOR=price_...
NEXT_PUBLIC_STRIPE_PRICE_PRO=price_...
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Supabase** (comptes, statut payant/quota côté serveur, historique) :
1. Crée un compte gratuit sur [supabase.com](https://supabase.com) → "New
   Project".
2. Une fois le projet créé, va dans **SQL Editor** → colle le contenu de
   [`supabase/schema.sql`](./supabase/schema.sql) → **Run**. Ça crée les
   tables `profiles`/`generations`, les policies de sécurité (RLS), le
   trigger qui crée un profil à l'inscription, et le bucket de stockage
   `thumbnails`.
3. Dans **Project Settings → API**, récupère `Project URL`, `anon public
   key` et `service_role key` → colle-les dans `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   ⚠️ La clé `service_role` contourne toute sécurité : jamais dans du code
   client, jamais commitée.
4. Dans **Authentication → Providers**, l'email (lien magique) est activé
   par défaut — rien à faire de plus pour tester. Pour de l'envoi réel en
   production, configure un fournisseur SMTP (Authentication → Email) : le
   service email intégré de Supabase est limité et pensé pour le test.
5. Redémarre `npm run dev` — le lien "Connexion" du menu devient
   fonctionnel, `/historique` se remplit après une génération connectée.

Sans ces variables, tout continue de fonctionner comme avant : styles
filtres en libre accès, mais connexion, historique et IA générative
indisponibles (avec des messages clairs, pas de plantage).

**Stripe** (pour activer le paiement) :
1. Crée un compte Stripe (mode test), crée deux produits récurrents
   (Creator 19€/mois, Pro 39€/mois), récupère leurs `price_id`.
2. Colle `STRIPE_SECRET_KEY` (clé secrète du dashboard Stripe test) et les
   deux `price_id` ci-dessus.
3. **Webhook** (nécessaire pour que payer active vraiment le plan) : dans
   le dashboard Stripe → Developers → Webhooks → "Add endpoint" → URL
   `https://<ton-domaine>/api/stripe/webhook` → sélectionne les événements
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` → copie le "Signing secret" dans
   `STRIPE_WEBHOOK_SECRET`.
4. Redémarre `npm run dev` — les boutons de la page `/pricing` redirigent
   alors vers un vrai Stripe Checkout en mode test (connexion requise :
   l'abonnement doit être lié à un compte pour que le webhook sache qui
   mettre à jour).

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
   10-15 créateurs. Objectif : 5-10 personnes prêtes à payer.
2. ~~Sécuriser la facturation~~ **Fait** : comptes Supabase + webhook
   Stripe, statut payant et quota vérifiés côté serveur.
3. **Premiers clients payants** via ta distribution existante (audience) +
   démarchage direct de créateurs identifiés à l'étape 1 — pas de pub
   payante tant que le pitch et le prix ne sont pas éprouvés en 1-to-1.
4. **Itérer sur les styles** en fonction des retours réels plutôt que
   d'ajouter des features à l'aveugle.

## Structure du projet

```
app/
  page.tsx                  landing page
  pricing/page.tsx          page tarifs + intégration Stripe Checkout
  generate/page.tsx         dashboard : upload, style, génération, téléchargement
  login/page.tsx            connexion par lien magique (Supabase Auth)
  historique/page.tsx       miniatures sauvegardées du compte connecté
  api/generate/route.ts     pipeline sharp (crop, filtre, texte, IA) + quota serveur
  api/checkout/route.ts     création de session Stripe Checkout (compte requis)
  api/history/route.ts      liste/suppression de l'historique (Supabase Storage)
  api/stripe/webhook/route.ts  synchronise le plan Supabase avec Stripe
lib/
  presets.ts              styles, grille tarifaire, constantes des zones IA
  stripe.ts               client Stripe (lazy, tolère l'absence de clé)
  openai.ts               client OpenAI (lazy, tolère l'absence de clé)
  supabase.ts             clients Supabase (browser + admin), résolution du user
  useSupabaseUser.ts       hook client : session Supabase en direct
supabase/
  schema.sql              tables, RLS, trigger, bucket — à coller dans SQL Editor
components/
  Navbar.tsx, Footer.tsx
```
