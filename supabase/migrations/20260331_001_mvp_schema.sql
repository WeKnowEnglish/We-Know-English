create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'staff', 'client');
create type public.attendance_status as enum ('present', 'late', 'absent');
create type public.ledger_entry_type as enum ('charge', 'payment', 'credit', 'adjustment');
create type public.feed_post_status as enum ('draft', 'published');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table public.payers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  display_name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  level text,
  created_at timestamptz not null default now()
);

create table public.payer_students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payer_id uuid not null references public.payers (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  unique (payer_id, student_id)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  class_type text not null check (class_type in ('private_1_1', 'small_group')),
  starts_at time,
  duration_minutes int default 50,
  created_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  session_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'canceled')),
  created_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status public.attendance_status not null default 'present',
  marked_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  student_id uuid not null references public.students (id) on delete cascade,
  media_path text not null,
  note text,
  captured_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete restrict
);

create table public.narrative_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  tag text not null,
  created_at timestamptz not null default now()
);

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  moment_id uuid references public.moments (id) on delete set null,
  body text not null,
  status public.feed_post_status not null default 'draft',
  published_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payer_id uuid not null references public.payers (id) on delete cascade,
  entry_type public.ledger_entry_type not null,
  amount_cents int not null check (amount_cents > 0),
  description text not null,
  session_id uuid references public.sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create table public.session_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payer_id uuid not null references public.payers (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  amount_cents int not null check (amount_cents > 0),
  reason text not null,
  status text not null default 'available' check (status in ('available', 'applied', 'expired')),
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payer_id uuid not null references public.payers (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  total_due_cents int not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  created_at timestamptz not null default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  amount_cents int not null,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_org_ids()
returns setof uuid
language sql
stable
as $$
  select organization_id
  from public.organization_members
  where profile_id = auth.uid();
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.payers enable row level security;
alter table public.students enable row level security;
alter table public.payer_students enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.moments enable row level security;
alter table public.narrative_tags enable row level security;
alter table public.feed_posts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.session_credits enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy "org_members_select_own_membership" on public.organization_members
for select using (profile_id = auth.uid());

create policy "organizations_visible_to_member" on public.organizations
for select using (id in (select public.current_user_org_ids()));

create policy "org_data_select_students" on public.students
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_students" on public.students
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_payers" on public.payers
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_payers" on public.payers
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_classes" on public.classes
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_classes" on public.classes
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_sessions" on public.sessions
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_sessions" on public.sessions
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_enrollments" on public.enrollments
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_enrollments" on public.enrollments
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_attendance" on public.attendance_records
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_attendance" on public.attendance_records
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_moments" on public.moments
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_moments" on public.moments
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_narrative_tags" on public.narrative_tags
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_narrative_tags" on public.narrative_tags
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_feed_posts" on public.feed_posts
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_feed_posts" on public.feed_posts
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_ledger_entries" on public.ledger_entries
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_ledger_entries" on public.ledger_entries
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_session_credits" on public.session_credits
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_session_credits" on public.session_credits
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_invoices" on public.invoices
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_invoices" on public.invoices
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_invoice_items" on public.invoice_items
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_invoice_items" on public.invoice_items
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));

create policy "org_data_select_payer_students" on public.payer_students
for select using (organization_id in (select public.current_user_org_ids()));
create policy "org_data_modify_payer_students" on public.payer_students
for all using (organization_id in (select public.current_user_org_ids()))
with check (organization_id in (select public.current_user_org_ids()));
