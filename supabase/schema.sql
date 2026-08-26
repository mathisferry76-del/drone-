-- ThumbAI — schema Supabase
-- À exécuter une fois dans Supabase : Project -> SQL Editor -> New query -> colle tout -> Run.

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text not null default 'free' check (plan in ('free', 'creator', 'pro')),
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

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

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

-- Bucket de stockage pour les miniatures générées (privé — accès via URL
-- signée générée par le serveur, jamais public).
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

drop policy if exists "Service role manages thumbnails" on storage.objects;
create policy "Service role manages thumbnails" on storage.objects
  for all using (bucket_id = 'thumbnails' and auth.role() = 'service_role');
