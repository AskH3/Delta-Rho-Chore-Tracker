-- HOUSE DUTY BOARD — Supabase schema
-- Paste this whole file into: Supabase Dashboard → SQL Editor → New query → Run

-- ── profiles: one row per account ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- auto-create a profile when someone signs up (name comes from the signup form)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- helper used by policies
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ── roster: rotation order per section ────────────────────────
create table public.roster (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('newboy','houseboy')),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ── chores: the chore bank per section ────────────────────────
create table public.chores (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('newboy','houseboy')),
  name text not null,
  days int[] not null default '{}',   -- 0=Mon … 6=Sun
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ── completions: posted proof of work ─────────────────────────
create table public.completions (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('newboy','houseboy')),
  chore_id uuid references public.chores on delete set null,
  chore_name text not null,
  day text,
  week int not null,
  member text not null,
  user_id uuid not null references auth.users on delete cascade,
  photo_path text not null,
  created_at timestamptz not null default now()
);

-- ── votes: one per person per completion ──────────────────────
create table public.votes (
  completion_id uuid not null references public.completions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  value int not null check (value in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (completion_id, user_id)
);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.roster      enable row level security;
alter table public.chores      enable row level security;
alter table public.completions enable row level security;
alter table public.votes       enable row level security;

-- profiles: everyone signed in can see names; you can edit your own name;
-- only the database owner (you, via dashboard) can grant is_admin.
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
create policy "edit own name" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid()));

-- roster: readable by all members; only admin can change it
create policy "roster readable" on public.roster
  for select to authenticated using (true);
create policy "roster admin write" on public.roster
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- chores: readable by all members; only admin can change the bank
create policy "chores readable" on public.chores
  for select to authenticated using (true);
create policy "chores admin write" on public.chores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- completions: readable by all; anyone can post their own;
-- only the poster or the admin can edit/delete
create policy "completions readable" on public.completions
  for select to authenticated using (true);
create policy "post own completion" on public.completions
  for insert to authenticated with check (user_id = auth.uid());
create policy "edit own or admin" on public.completions
  for update to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "delete own or admin" on public.completions
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- votes: readable by all; you manage only your own vote
create policy "votes readable" on public.votes
  for select to authenticated using (true);
create policy "cast own vote" on public.votes
  for insert to authenticated with check (user_id = auth.uid());
create policy "change own vote" on public.votes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove own vote" on public.votes
  for delete to authenticated using (user_id = auth.uid());

-- ── storage bucket for photos ─────────────────────────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);

create policy "photos are viewable" on storage.objects
  for select using (bucket_id = 'photos');
create policy "members upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');
create policy "owner or admin updates photos" on storage.objects
  for update to authenticated using (bucket_id = 'photos' and (owner = auth.uid() or public.is_admin()));
create policy "owner or admin deletes photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and (owner = auth.uid() or public.is_admin()));

-- ── AFTER YOU SIGN UP: make yourself admin ────────────────────
-- Run this once, replacing the email with the one YOU signed up with:
-- update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'you@example.com');
