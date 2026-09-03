-- MIN IA — schema Supabase
-- À exécuter une fois dans Supabase : Project -> SQL Editor -> New query -> colle tout -> Run.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  stripe_customer_id text,
  free_generations_used int not null default 0,
  credits_balance int not null default 0,
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  bonus_generations int not null default 0,
  created_at timestamptz not null default now()
);

-- Si la table existait déjà (déploiement précédent), ajoute les nouvelles
-- colonnes de parrainage sans tout recréer.
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);
alter table public.profiles add column if not exists bonus_generations int not null default 0;

-- Passage d'un modèle par abonnement (plan mensuel + quota qui se
-- réinitialise) à un modèle prépayé par crédits, dépensés à la génération et
-- rechargeables à tout moment, sans date de renouvellement. plan/
-- ai_uses_this_month/ai_uses_month_key/stripe_subscription_id ne sont plus
-- lus par le code applicatif ; laissés en base tels quels (pas de perte de
-- données) pour un déploiement déjà existant plutôt que de les supprimer.
alter table public.profiles add column if not exists credits_balance int not null default 0;

-- plan n'existe que sur un déploiement précédent au modèle par abonnement —
-- absent sur une toute nouvelle installation, d'où la garde explicite avant
-- ces ALTER (qui n'ont pas de variante "if exists" pour une colonne).
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
-- metadata à signInWithOtp), les deux comptes reçoivent directement des
-- crédits bonus (2 générations pour le filleul, 3 pour le parrain — au tarif
-- de 200 crédits/génération). bonus_generations reste en base pour un
-- déploiement existant mais n'est plus incrémenté : les bonus vont
-- désormais droit dans credits_balance, seul solde lu par l'application.
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
  values (new.id, new.email, new_code, referrer_id, case when referrer_id is not null then 400 else 0 end);

  if referrer_id is not null then
    update public.profiles
    set credits_balance = credits_balance + 600
    where id = referrer_id;
  end if;

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
begin
  if p_force_paid then
    return 'ok_owner';
  end if;

  select free_generations_used, credits_balance
  into v_free_used, v_credits
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return 'no_profile';
  end if;

  if v_free_used < 1 then
    update public.profiles set free_generations_used = free_generations_used + 1
      where id = p_user_id;
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
