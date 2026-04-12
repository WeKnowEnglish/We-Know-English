-- Owner-approved teacher joins: pending requests table; replace instant join_organization_as_staff.

do $$ begin
  create type public.org_join_request_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organization_teacher_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.org_join_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create unique index if not exists organization_teacher_join_requests_one_pending_per_teacher_uidx
  on public.organization_teacher_join_requests (organization_id, profile_id)
  where status = 'pending';

alter table public.organization_teacher_join_requests enable row level security;

-- Requesters can see their own rows (for "pending request" badges on the directory page).
drop policy if exists "org_join_requests_select_own" on public.organization_teacher_join_requests;
create policy "org_join_requests_select_own" on public.organization_teacher_join_requests
for select using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- request_join_organization_as_teacher
-- ---------------------------------------------------------------------------
create or replace function public.request_join_organization_as_teacher(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  if (select pr.app_role::text from public.profiles pr where pr.id = auth.uid()) is distinct from 'teacher' then
    return jsonb_build_object('ok', false, 'error', 'Only teacher accounts can request to join an organization.');
  end if;

  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'error', 'Organization not found.');
  end if;

  if exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.profile_id = auth.uid()
  ) then
    return jsonb_build_object('ok', true, 'kind', 'already_member', 'organization_id', p_organization_id);
  end if;

  if exists (
    select 1 from public.organization_teacher_join_requests r
    where r.organization_id = p_organization_id
      and r.profile_id = auth.uid()
      and r.status = 'pending'
  ) then
    return jsonb_build_object('ok', true, 'kind', 'already_pending', 'organization_id', p_organization_id);
  end if;

  insert into public.profiles (id, full_name, role, app_role)
  select
    au.id,
    coalesce(nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(au.email, ''), '@', 1), 'Member'),
    'tutor'::public.profile_role,
    'teacher'::public.app_role
  from auth.users au
  where au.id = auth.uid()
  on conflict (id) do nothing;

  insert into public.organization_teacher_join_requests (organization_id, profile_id, status)
  values (p_organization_id, auth.uid(), 'pending');

  return jsonb_build_object('ok', true, 'kind', 'request_sent', 'organization_id', p_organization_id);
end;
$$;

revoke all on function public.request_join_organization_as_teacher(uuid) from public;
grant execute on function public.request_join_organization_as_teacher(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_pending_join_requests_for_org (owners only)
-- ---------------------------------------------------------------------------
create or replace function public.list_pending_join_requests_for_org(p_organization_id uuid)
returns table (
  request_id uuid,
  profile_id uuid,
  requester_full_name text,
  requester_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.role = 'owner'::public.member_role
  ) then
    return;
  end if;

  return query
  select
    r.id,
    r.profile_id,
    p.full_name,
    lower(trim(coalesce(u.email, '')))::text,
    r.created_at
  from public.organization_teacher_join_requests r
  join public.profiles p on p.id = r.profile_id
  join auth.users u on u.id = r.profile_id
  where r.organization_id = p_organization_id
    and r.status = 'pending'
  order by r.created_at asc;
end;
$$;

revoke all on function public.list_pending_join_requests_for_org(uuid) from public;
grant execute on function public.list_pending_join_requests_for_org(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- approve / reject (owners only)
-- ---------------------------------------------------------------------------
create or replace function public.approve_organization_join_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_profile uuid;
  v_status public.org_join_request_status;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  select r.organization_id, r.profile_id, r.status
    into v_org, v_profile, v_status
  from public.organization_teacher_join_requests r
  where r.id = p_request_id;

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'Request not found.');
  end if;

  if v_status is distinct from 'pending'::public.org_join_request_status then
    return jsonb_build_object('ok', false, 'error', 'This request is no longer pending.');
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_org and m.profile_id = auth.uid() and m.role = 'owner'::public.member_role
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the organization owner can approve requests.');
  end if;

  insert into public.organization_members (organization_id, profile_id, role)
  values (v_org, v_profile, 'staff'::public.member_role)
  on conflict (organization_id, profile_id) do nothing;

  update public.organization_teacher_join_requests r
  set
    status = 'approved',
    resolved_at = now(),
    resolved_by = auth.uid()
  where r.id = p_request_id;

  return jsonb_build_object('ok', true, 'organization_id', v_org);
end;
$$;

revoke all on function public.approve_organization_join_request(uuid) from public;
grant execute on function public.approve_organization_join_request(uuid) to authenticated;

create or replace function public.reject_organization_join_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status public.org_join_request_status;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  select r.organization_id, r.status into v_org, v_status
  from public.organization_teacher_join_requests r
  where r.id = p_request_id;

  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'Request not found.');
  end if;

  if v_status is distinct from 'pending'::public.org_join_request_status then
    return jsonb_build_object('ok', false, 'error', 'This request is no longer pending.');
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_org and m.profile_id = auth.uid() and m.role = 'owner'::public.member_role
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only the organization owner can reject requests.');
  end if;

  update public.organization_teacher_join_requests r
  set
    status = 'rejected',
    resolved_at = now(),
    resolved_by = auth.uid()
  where r.id = p_request_id;

  return jsonb_build_object('ok', true, 'organization_id', v_org);
end;
$$;

revoke all on function public.reject_organization_join_request(uuid) from public;
grant execute on function public.reject_organization_join_request(uuid) to authenticated;

-- Remove instant staff join (replaced by request + owner approval).
drop function if exists public.join_organization_as_staff(uuid);
