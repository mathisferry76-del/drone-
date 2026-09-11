-- MIN IA — schema Supabase
-- À exécuter une fois dans Supabase : Project -> SQL Editor -> New query -> colle tout -> Run.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text,
  stripe_customer_id text,
  stripe_subscription_id text,
  free_generations_used int not null default 0,
  credits_balance int not null default 0,
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  bonus_generations int not null default 0,
  created_at timestamptz not null default now()
);

-- Si la table existait déjà (déploiement précédent), ajoute les colonnes
-- manquantes sans tout recréer.
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);
alter table public.profiles add column if not exists bonus_generations int not null default 0;
alter table public.profiles add column if not exists credits_balance int not null default 0;
alter table public.profiles add column if not exists stripe_subscription_id text;

-- Sécurité audit (2026-09-10) : le bonus de parrainage était crédité au
-- moment de l'inscription (handle_new_user, plus bas), avant toute vraie
-- utilisation — un compte jetable (email à usage unique) créé via un lien
-- de parrainage suffisait à toucher 400 crédits pour le filleul et 600
-- pour le parrain, sans jamais utiliser le service. Cette colonne marque
-- si le bonus a déjà été accordé pour CE compte filleul, pour ne le
-- déclencher qu'une seule fois, au bon moment (voir reserve_credits).
alter table public.profiles add column if not exists referral_bonus_granted boolean not null default false;

-- Modèle hybride : abonnement mensuel (recharge credits_balance à chaque
-- renouvellement, ne le plafonne ni ne le remet jamais à zéro) + achat
-- ponctuel de packs. plan n'est plus une des 4 valeurs fixes de l'ancien
-- modèle par quota mensuel — c'est maintenant simplement l'id du palier
-- d'abonnement actif (voir SUBSCRIPTION_TIERS), ou null sans abonnement.
-- Retire donc la contrainte NOT NULL/DEFAULT/CHECK de l'ancien modèle si
-- elle existe encore (DROP NOT NULL/DEFAULT sont des no-op sans erreur si
-- déjà absents, donc ce bloc est sûr à rejouer sur n'importe quel état
-- antérieur du schéma). Absent sur une toute nouvelle installation (déjà
-- créée sans contrainte par le CREATE TABLE ci-dessus), d'où la garde
-- explicite avant des ALTER qui n'ont pas de variante "if exists" pour une
-- colonne.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan'
  ) then
    alter table public.profiles alter column plan drop not null;
    alter table public.profiles alter column plan drop default;
    alter table public.profiles drop constraint if exists profiles_plan_check;
  end if;
end $$;

-- Conversion unique des anciens bonus de parrainage (ancien modèle) en
-- crédits, au même tarif que GENERATION_CREDIT_COST (200/génération) —
-- idempotent : bonus_generations passe à 0, donc un second passage n'ajoute
-- rien de plus.
update public.profiles
set credits_balance = credits_balance + bonus_generations * 200,
    bonus_generations = 0
where bonus_generations > 0;

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  storage_path text not null,
  preset_id text,
  used_ai boolean not null default false,
  created_at timestamptz not null default now()
);

-- 'kind' + 'storage_bucket' : ajoutés pour la vidéo (/api/animate), qui
-- stocke dans un bucket séparé ('videos', pas 'thumbnails') et doit être
-- rendue différemment dans /historique (<video> plutôt que <img>). Les
-- lignes existantes (miniatures/impress) gardent leurs valeurs par défaut
-- 'image'/'thumbnails' sans backfill nécessaire.
alter table public.generations add column if not exists kind text not null default 'image';
alter table public.generations add column if not exists storage_bucket text not null default 'thumbnails';

-- "Éditer une vidéo" (app/api/video-edit/route.ts + status/route.ts) lance
-- un job Replicate asynchrone (predictions.create) et le suit via polling
-- depuis deux routes séparées et sans état partagé — sans cette table, la
-- seule façon de savoir quelle réservation de crédits rembourser sur un
-- échec serait de faire confiance à un token renvoyé par le client, ce
-- qu'un compte malveillant pourrait rejouer plusieurs fois sur le même
-- predictionId pour se créditer des crédits gratuits à répétition (le
-- webhook Stripe est protégé par une signature ; ce chemin ne l'était par
-- rien du tout). Cette table fait à la fois office de preuve de propriété
-- (seul le compte qui a lancé le job peut le consulter) et de verrou contre
-- le double remboursement (transition 'processing' -> 'finalizing' faite
-- par une seule requête à la fois via la clause `where status = 'processing'`
-- du UPDATE, jamais par une simple lecture suivie d'une écriture séparée).
create table if not exists public.video_edit_jobs (
  prediction_id text primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  reservation text not null,
  status text not null default 'processing',
  storage_path text,
  error_message text,
  created_at timestamptz not null default now()
);
alter table public.video_edit_jobs enable row level security;
-- Aucune policy pour anon/authenticated, volontairement : ce n'est jamais
-- lu ou écrit depuis le navigateur, seulement par le serveur via le client
-- admin (service_role, qui contourne RLS) dans les deux routes ci-dessus.

-- Le prix de cette fonctionnalité est passé d'un forfait fixe à un tarif
-- proportionnel à la durée réelle de la vidéo (retour explicite : une
-- vidéo de 4s ne doit pas coûter le même prix qu'une vidéo de 7s). Ce
-- montant doit être mémorisé par job pour que le remboursement en cas
-- d'échec (app/api/video-edit/status/route.ts) rembourse exactement ce qui
-- a été réservé, pas un forfait qui ne correspond plus au prix réel.
alter table public.video_edit_jobs add column if not exists cost int not null default 6000;

alter table public.profiles enable row level security;
alter table public.generations enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

-- Volontairement PAS de policy UPDATE pour les utilisateurs sur profiles :
-- plan, quota et champs Stripe ne doivent jamais être modifiables depuis le
-- navigateur (même sa propre ligne), seul le serveur (clé service_role, qui
-- contourne RLS) écrit ces colonnes. Une policy UPDATE basée sur
-- auth.uid() = id laisserait n'importe quel utilisateur s'attribuer
-- plan = 'pro' directement depuis la console du navigateur.
drop policy if exists "Users can update own profile" on public.profiles;

drop policy if exists "Users can view own generations" on public.generations;
create policy "Users can view own generations" on public.generations
  for select using (auth.uid() = user_id);

drop policy if exists "Users can delete own generations" on public.generations;
create policy "Users can delete own generations" on public.generations
  for delete using (auth.uid() = user_id);

-- Le serveur (clé service_role, qui contourne la RLS) est seul à insérer des
-- générations et à modifier le quota/plan — jamais le navigateur directement.

-- Crée automatiquement une ligne de profil à chaque inscription, avec un
-- code de parrainage unique dérivé de son id (pas de risque de collision).
-- Si l'inscription vient d'un lien de parrainage (?ref=CODE passé en
-- metadata à signInWithOtp), le lien referred_by est enregistré, mais AUCUN
-- crédit n'est distribué ici. Sécurité audit (2026-09-10) : distribuer les
-- 400/600 crédits bonus directement à l'inscription permettait de farmer
-- des crédits gratuits avec des emails jetables, sans jamais utiliser le
-- service — le bonus est désormais accordé dans reserve_credits(), au
-- moment où le filleul consomme réellement sa première génération (essai
-- gratuit), la seule preuve d'usage réel qu'on ait. bonus_generations
-- reste en base pour un déploiement existant mais n'est plus incrémenté :
-- les bonus vont dans credits_balance, seul solde lu par l'application.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_code text := upper(substr(replace(new.id::text, '-', ''), 1, 8));
  ref_code text := new.raw_user_meta_data->>'referral_code';
  referrer_id uuid;
begin
  if ref_code is not null then
    select id into referrer_id from public.profiles where referral_code = ref_code;
  end if;

  insert into public.profiles (id, email, referral_code, referred_by, credits_balance)
  values (new.id, new.email, new_code, referrer_id, 0);

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Le trigger ne génère un code que pour les *nouvelles* inscriptions —
-- comble le code manquant pour les comptes déjà créés avant ce script.
update public.profiles
set referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
where referral_code is null;

-- Bucket de stockage pour les miniatures générées (privé — accès via URL
-- signée générée par le serveur, jamais public).
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

drop policy if exists "Service role manages thumbnails" on storage.objects;
create policy "Service role manages thumbnails" on storage.objects
  for all using (bucket_id = 'thumbnails' and auth.role() = 'service_role');

-- Bucket séparé pour les vidéos générées (/api/animate) — même politique
-- d'accès privé que 'thumbnails' ci-dessus, juste un bucket distinct
-- puisque ce sont des fichiers vidéo (.mp4) et non des images. Nécessaire
-- car l'URL renvoyée par fal.ai/Replicate pour Veo 3.1 est temporaire :
-- sans ce re-stockage, la vidéo générée devenait irrécupérable dès que
-- cette URL expirait ou que la page était rechargée.
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

drop policy if exists "Service role manages videos" on storage.objects;
create policy "Service role manages videos" on storage.objects
  for all using (bucket_id = 'videos' and auth.role() = 'service_role');

drop function if exists public.reserve_generation(uuid, boolean, text, int, boolean);
drop function if exists public.release_generation_reservation(uuid, text, text);

-- Réservation atomique d'une génération IA (essai gratuit unique, sinon
-- débit de crédits prépayés). "for update" verrouille la ligne du profil le
-- temps de la transaction : si deux requêtes du même utilisateur arrivent en
-- même temps, la deuxième attend que la première ait fini avant de lire le
-- solde — élimine la race condition d'un simple "lire puis écrire" en deux
-- temps séparés côté application, qui laissait dépasser le solde par des
-- appels concurrents. Retourne un statut texte que le serveur interprète :
-- 'no_profile', 'ok_owner', 'ok_trial', 'ok_credits', 'insufficient_credits'.
create or replace function public.reserve_credits(
  p_user_id uuid,
  p_cost int,
  -- Bypass total (compte propriétaire) : ne touche ni l'essai gratuit ni le
  -- solde de crédits, toujours accepté.
  p_force_paid boolean default false
)
returns text
language plpgsql
security definer
as $$
declare
  v_free_used int;
  v_credits int;
  v_referred_by uuid;
  v_referral_bonus_granted boolean;
begin
  if p_force_paid then
    return 'ok_owner';
  end if;

  select free_generations_used, credits_balance, referred_by, referral_bonus_granted
  into v_free_used, v_credits, v_referred_by, v_referral_bonus_granted
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return 'no_profile';
  end if;

  if v_free_used < 1 then
    update public.profiles set free_generations_used = free_generations_used + 1
      where id = p_user_id;

    -- Bonus de parrainage validé ici, pas à l'inscription (voir
    -- handle_new_user) : seulement au moment où ce compte filleul consomme
    -- réellement sa première génération, la seule preuve d'usage réel
    -- qu'on ait — closes le farming par emails jetables créés juste pour
    -- toucher le bonus sans jamais utiliser le service.
    -- referral_bonus_granted empêche un second déclenchement si ce compte
    -- redemande plus tard une réservation avec free_used déjà à 0 (ne
    -- devrait pas arriver, mais coûte rien de le garder atomique ici).
    if v_referred_by is not null and not v_referral_bonus_granted then
      update public.profiles
      set credits_balance = credits_balance + 400, referral_bonus_granted = true
      where id = p_user_id;
      update public.profiles
      set credits_balance = credits_balance + 600
      where id = v_referred_by;
    end if;

    return 'ok_trial';
  end if;

  if v_credits < p_cost then
    return 'insufficient_credits';
  end if;

  update public.profiles
  set credits_balance = credits_balance - p_cost
  where id = p_user_id;

  return 'ok_credits';
end;
$$;

-- Compense une réservation faite par reserve_credits quand la génération
-- échoue ensuite (erreur IA, etc.) — sans ça, un utilisateur dont la
-- génération plante perdrait quand même son essai gratuit ou ses crédits
-- pour rien. 'ok_owner' n'a jamais rien débité, donc rien à rembourser.
create or replace function public.release_credits_reservation(
  p_user_id uuid,
  p_reservation text,
  p_cost int
)
returns void
language plpgsql
security definer
as $$
begin
  if p_reservation = 'ok_trial' then
    update public.profiles
    set free_generations_used = greatest(0, free_generations_used - 1)
    where id = p_user_id;
  elsif p_reservation = 'ok_credits' then
    update public.profiles
    set credits_balance = credits_balance + p_cost
    where id = p_user_id;
  end if;
end;
$$;

-- Ajoute des crédits après un achat confirmé par le webhook Stripe
-- (checkout.session.completed, paiement one-shot) — incrément atomique,
-- jamais un "lire le solde puis réécrire" côté application.
create or replace function public.add_credits(
  p_user_id uuid,
  p_amount int
)
returns void
language sql
security definer
as $$
  update public.profiles
  set credits_balance = credits_balance + p_amount
  where id = p_user_id;
$$;

-- CRITIQUE : Postgres accorde EXECUTE à PUBLIC par défaut sur toute fonction
-- nouvellement créée, et Supabase expose automatiquement chaque fonction du
-- schéma public comme endpoint RPC appelable par les rôles anon/authenticated
-- (donc depuis le navigateur, par n'importe quel compte connecté) — sauf
-- révocation explicite. Ces trois fonctions sont SECURITY DEFINER (elles
-- s'exécutent avec les droits du propriétaire, en contournant RLS) et ne
-- vérifient jamais elles-mêmes qui les appelle ; le contrôle d'accès repose
-- entièrement sur le fait qu'aujourd'hui seul le serveur (clé service_role)
-- les appelle. Sans cette révocation, n'importe quel compte connecté pouvait
-- s'octroyer des crédits gratuits en appelant directement
-- `supabase.rpc('add_credits', {...})` ou
-- `supabase.rpc('release_credits_reservation', { p_reservation: 'ok_credits', p_cost: 999999, ... })`
-- depuis la console du navigateur, sans jamais payer sur Stripe. Le code
-- applicatif n'appelle déjà ces fonctions que via le client admin
-- (service_role, voir lib/supabase.ts) — cette révocation ne change donc
-- aucun comportement légitime.
revoke execute on function public.reserve_credits(uuid, int, boolean) from public, anon, authenticated;
revoke execute on function public.release_credits_reservation(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.add_credits(uuid, int) from public, anon, authenticated;
grant execute on function public.reserve_credits(uuid, int, boolean) to service_role;
grant execute on function public.release_credits_reservation(uuid, text, int) to service_role;
grant execute on function public.add_credits(uuid, int) to service_role;

-- Sécurité audit (2026-09-10) : Stripe garantit la livraison "at-least-once"
-- de ses webhooks et documente explicitement que le même événement peut être
-- envoyé plusieurs fois (retry réseau, nouvel envoi manuel depuis le
-- dashboard Stripe) — sans déduplication, deux livraisons du même
-- checkout.session.completed ou invoice.paid appellent add_credits() deux
-- fois, créditant le compte en double pour un seul paiement réel. Cette
-- table enregistre chaque event.id Stripe déjà traité ; la clé primaire
-- fait tout le travail de déduplication de façon atomique (deux requêtes
-- concurrentes sur le même event.id : une seule réussit l'insert, l'autre
-- reçoit une violation de contrainte unique et s'arrête avant de créditer
-- quoi que ce soit) — voir app/api/stripe/webhook/route.ts.
create table if not exists public.stripe_processed_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);
alter table public.stripe_processed_events enable row level security;
-- Aucune policy pour anon/authenticated, volontairement : jamais lu ou écrit
-- depuis le navigateur, seulement par le webhook via le client admin
-- (service_role, qui contourne RLS).

-- Fil d'activité en direct sur la home (compteur + notifications) — explicite
-- demande de rester 100% honnête : chaque ligne correspond à un événement
-- RÉEL (achat de pack ou souscription confirmés par le webhook Stripe),
-- jamais fabriqué. Pas de user_id ni email stockés ici : ces événements sont
-- affichés publiquement à tout visiteur du site (app/api/activity/route.ts),
-- donc rien qui identifie qui que ce soit n'y transite, uniquement le type
-- d'événement et l'heure. Les générations n'ont pas besoin de leur propre
-- ligne ici : la table generations existante sert déjà de source pour ça.
create table if not exists public.activity_events (
  id bigserial primary key,
  kind text not null,
  created_at timestamptz not null default now()
);
alter table public.activity_events enable row level security;

-- Demande explicite (2026-09-10) d'afficher un identifiant dans les
-- notifications, plutôt que "Quelqu'un" générique. Stocke uniquement la
-- version déjà masquée de l'email (voir lib/mask-email.ts, ex: "ma***76"),
-- jamais l'email complet ni le domaine — même si cette table était lue
-- directement, aucune donnée assez précise pour ré-identifier quelqu'un n'y
-- transite.
alter table public.activity_events add column if not exists pseudo text;
-- Aucune policy pour anon/authenticated, volontairement : écrit uniquement
-- par le webhook Stripe (service_role), lu uniquement par notre propre route
-- /api/activity (service_role aussi) qui renvoie une version agrégée et
-- anonyme — jamais interrogée directement depuis le navigateur.

-- Objectif de croissance (2026-09-11) : tous les 1000 générations (1000,
-- 2000, 3000...), un code promo -10% valable 24h est créé automatiquement
-- (voir lib/growth-milestones.ts, appelé depuis /api/activity à chaque
-- poll). "threshold" est la clé d'idempotence : /api/activity peut être
-- appelée par des dizaines de visiteurs en même temps au moment exact où le
-- compteur franchit un palier — un seul insert réussit (contrainte
-- primary key), tous les autres échouent avec une violation unique et
-- abandonnent sans jamais appeler Stripe. promo_code/stripe_*_id/expires_at
-- restent null le temps que la requête gagnante crée réellement le code
-- côté Stripe ; si cet appel Stripe échoue, la ligne est supprimée pour
-- qu'une tentative ultérieure puisse réessayer plutôt que de rester bloquée
-- sur un palier jamais vraiment activé.
create table if not exists public.promo_milestones (
  threshold int primary key,
  promo_code text,
  stripe_coupon_id text,
  stripe_promotion_code_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.promo_milestones enable row level security;
-- Aucune policy pour anon/authenticated, volontairement : écrit et lu
-- uniquement par /api/activity via le client admin (service_role) — le code
-- promo lui-même est renvoyé dans la réponse JSON publique de cette route
-- (c'est le but), mais jamais via une requête directe des rôles anon/
-- authenticated sur cette table.
