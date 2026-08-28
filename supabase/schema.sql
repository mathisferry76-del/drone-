-- MIN IA — schema Supabase
-- À exécuter une fois dans Supabase : Project -> SQL Editor -> New query -> colle tout -> Run.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text not null default 'free' check (plan in ('free', 'starter', 'creator', 'pro', 'studio')),
  stripe_customer_id text,
  stripe_subscription_id text,
  free_generations_used int not null default 0,
  ai_uses_this_month int not null default 0,
  ai_uses_month_key text,
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

-- Nouveau modèle : 4 paliers payants (starter/creator/pro/studio), plus
-- d'offre gratuite. Élargit la contrainte pour un déploiement existant.
alter table public.profiles drop constraint if exists profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan in ('free', 'starter', 'creator', 'pro', 'studio'));

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
-- metadata à signInWithOtp), les deux comptes reçoivent des générations
-- bonus immédiatement.
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

  insert into public.profiles (id, email, referral_code, referred_by, bonus_generations)
  values (new.id, new.email, new_code, referrer_id, case when referrer_id is not null then 2 else 0 end);

  if referrer_id is not null then
    update public.profiles
    set bonus_generations = bonus_generations + 3
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

-- Réservation atomique d'un quota de génération (essai gratuit ou quota IA
-- mensuel). "for update" verrouille la ligne du profil le temps de la
-- transaction : si deux requêtes du même utilisateur arrivent en même temps,
-- la deuxième attend que la première ait fini avant de lire le compteur —
-- élimine la race condition d'un simple "lire puis écrire" en deux temps
-- séparés côté application, qui laissait dépasser le quota par des appels
-- concurrents. Retourne un statut texte que le serveur interprète :
-- 'no_profile', 'needs_plan', 'trial_used', 'ok_trial', 'quota_exceeded',
-- 'ok_ai', 'ok_filter'.
create or replace function public.reserve_generation(
  p_user_id uuid,
  p_ai_enhance boolean,
  p_month_key text,
  p_ai_cap int,
  -- Lets the caller force the paid/capped path even for a "free" plan row
  -- (used for the app's temporary manual Pro test accounts) instead of the
  -- single free-trial path, while staying on the same atomic reservation.
  p_force_paid boolean default false
)
returns text
language plpgsql
security definer
as $$
declare
  v_plan text;
  v_free_used int;
  v_ai_used int;
  v_ai_key text;
begin
  select plan, free_generations_used, ai_uses_this_month, ai_uses_month_key
  into v_plan, v_free_used, v_ai_used, v_ai_key
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return 'no_profile';
  end if;

  if v_plan = 'free' and not p_force_paid then
    if not p_ai_enhance then
      return 'needs_plan';
    end if;
    if v_free_used >= 1 then
      return 'trial_used';
    end if;
    update public.profiles set free_generations_used = free_generations_used + 1
      where id = p_user_id;
    return 'ok_trial';
  end if;

  if not p_ai_enhance then
    return 'ok_filter';
  end if;

  if v_ai_key is distinct from p_month_key then
    v_ai_used := 0;
  end if;

  if v_ai_used >= p_ai_cap then
    return 'quota_exceeded';
  end if;

  update public.profiles
  set ai_uses_this_month = v_ai_used + 1,
      ai_uses_month_key = p_month_key
  where id = p_user_id;

  return 'ok_ai';
end;
$$;

-- Compense une réservation faite par reserve_generation quand la génération
-- échoue ensuite (erreur OpenAI, etc.) — sans ça, un utilisateur dont la
-- génération plante perdrait quand même une unité de son quota pour rien.
create or replace function public.release_generation_reservation(
  p_user_id uuid,
  p_reservation text,
  p_month_key text
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
  elsif p_reservation = 'ok_ai' then
    update public.profiles
    set ai_uses_this_month = greatest(0, ai_uses_this_month - 1)
    where id = p_user_id and ai_uses_month_key = p_month_key;
  end if;
end;
$$;
