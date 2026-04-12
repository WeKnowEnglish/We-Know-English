-- WKE Portal: profiles (role, avatar), students (parent, skills), classes (tutor, title, schedule),
-- enrollments (rate_override), sessions (notes, mood), feed table, invoice extensions, Stripe link.

do $$ begin
  create type public.profile_role as enum ('admin', 'tutor', 'parent');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists role public.profile_role not null default 'tutor',
  add column if not exists avatar text,
  add column if not exists stripe_customer_id text;

alter table public.students
  add column if not exists parent_id uuid references public.profiles (id) on delete set null,
  add column if not exists name text,
  add column if not exists bio text,
  add column if not exists birthdate date,
  add column if not exists skills_points int not null default 0,
  add column if not exists internal_notes text;

update public.students set name = coalesce(name, full_name) where name is null;

alter table public.classes
  add column if not exists tutor_id uuid references public.profiles (id) on delete set null,
  add column if not exists title text,
  add column if not exists schedule text;

update public.classes set title = coalesce(title, name) where title is null;

alter table public.enrollments
  add column if not exists rate_override numeric(12, 2);

alter table public.sessions
  add column if not exists notes text,
  add column if not exists mood_emoji text;

do $$ begin
  create type public.feed_item_type as enum ('photo', 'achievement', 'note');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.feed (
  id uuid primary key default gen_random_uuid (),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  type public.feed_item_type not null,
  content text,
  media_url text,
  created_at timestamptz not null default now ()
);

create index if not exists feed_student_created_idx on public.feed (student_id, created_at desc);

alter table public.invoices
  add column if not exists parent_id uuid references public.profiles (id) on delete set null,
  add column if not exists session_count int not null default 0,
  add column if not exists stripe_invoice_id text;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (id = auth.uid ());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (id = auth.uid ());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (id = auth.uid ());

alter table public.feed enable row level security;

drop policy if exists "feed_org_select" on public.feed;
drop policy if exists "feed_select_tutor_or_parent" on public.feed;
create policy "feed_select_tutor_or_parent" on public.feed
for select using (
  organization_id in (select public.current_user_org_ids ())
  or exists (
    select 1
    from public.students s
    where s.id = feed.student_id
      and s.parent_id = auth.uid ()
  )
);

drop policy if exists "feed_org_modify" on public.feed;
create policy "feed_org_modify" on public.feed
for all using (organization_id in (select public.current_user_org_ids ()))
with check (organization_id in (select public.current_user_org_ids ()));
