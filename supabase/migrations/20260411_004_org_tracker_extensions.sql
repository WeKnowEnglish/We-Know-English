-- Tracker: org bootstrap RPC, class/student JSON settings, nullable student email + auth link,
-- student read RLS for linked accounts, profiles.last_active_organization_id.

-- ---------------------------------------------------------------------------
-- profiles: remember last org for teachers
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_active_organization_id uuid references public.organizations (id) on delete set null;

-- ---------------------------------------------------------------------------
-- classes: flexible UI payload (join codes, schedule, grade/CEFR, etc.)
-- ---------------------------------------------------------------------------
alter table public.classes
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- students: optional email, link to auth user, extra fields in profile jsonb
-- ---------------------------------------------------------------------------
alter table public.students
  add column if not exists email text,
  add column if not exists linked_user_id uuid references auth.users (id) on delete set null,
  add column if not exists profile jsonb not null default '{}'::jsonb;

create unique index if not exists students_org_email_lower_uidx
  on public.students (organization_id, lower(trim(email)))
  where email is not null and trim(email) <> '';

create index if not exists students_linked_user_idx on public.students (linked_user_id)
  where linked_user_id is not null;

-- ---------------------------------------------------------------------------
-- RPC: create organization + owner membership (RLS does not allow direct inserts)
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if trim(coalesce(org_name, '')) = '' then
    raise exception 'Organization name required';
  end if;

  insert into public.organizations (name)
  values (trim(org_name))
  returning id into new_org_id;

  insert into public.organization_members (organization_id, profile_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;

revoke all on function public.create_organization(text) from public;
grant execute on function public.create_organization(text) to authenticated;

-- Link org-scoped student rows to the authenticated user by matching email (signup / login).
create or replace function public.claim_student_accounts_on_signup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  em text;
  updated_count int := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  select lower(trim(u.email)) into em from auth.users u where u.id = auth.uid();
  if em is null or em = '' then
    return 0;
  end if;

  update public.students s
  set
    linked_user_id = auth.uid(),
    profile = coalesce(s.profile, '{}'::jsonb)
      || jsonb_build_object('accountStatus', 'active', 'lastLoginAt', to_jsonb((now() at time zone 'utc')::text))
  where lower(trim(s.email)) = em
    and (s.linked_user_id is null or s.linked_user_id = auth.uid());

  get diagnostics updated_count = ROW_COUNT;
  return updated_count;
end;
$$;

revoke all on function public.claim_student_accounts_on_signup() from public;
grant execute on function public.claim_student_accounts_on_signup() to authenticated;

-- Student self-serve: join a class by join code (stored in classes.settings.joinCode).
create or replace function public.student_join_class_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  oid uuid;
  cname text;
  sid uuid;
  uemail text;
  uname text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'You need to be signed in to join a class.');
  end if;

  select lower(trim(u.email)) into uemail from auth.users u where u.id = auth.uid();
  if uemail is null or uemail = '' then
    return jsonb_build_object('ok', false, 'message', 'We need your account email to add you to the roster.');
  end if;

  select c.id, c.organization_id, c.name
    into cid, oid, cname
  from public.classes c
  where upper(trim(c.settings ->> 'joinCode')) = upper(trim(p_code))
  limit 1;

  if cid is null then
    return jsonb_build_object('ok', false, 'message', 'Invalid join code.');
  end if;

  select
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      split_part(lower(trim(u.email)), '@', 1)
    )
  into uname
  from auth.users u
  where u.id = auth.uid();

  select s.id
    into sid
  from public.students s
  where s.organization_id = oid
    and (s.linked_user_id = auth.uid() or lower(trim(s.email)) = uemail)
  limit 1;

  if sid is null then
    insert into public.students (
      organization_id,
      full_name,
      level,
      email,
      linked_user_id,
      profile,
      skills_points
    )
    values (
      oid,
      coalesce(uname, split_part(uemail, '@', 1)),
      'Beginner',
      uemail,
      auth.uid(),
      jsonb_build_object('accountStatus', 'active', 'gender', 'other'),
      0
    )
    returning id into sid;
  else
    update public.students s
    set
      linked_user_id = coalesce(s.linked_user_id, auth.uid()),
      email = coalesce(s.email, uemail),
      profile = coalesce(s.profile, '{}'::jsonb) || jsonb_build_object('accountStatus', 'active')
    where s.id = sid;
  end if;

  if exists (
    select 1 from public.enrollments e
    where e.organization_id = oid and e.class_id = cid and e.student_id = sid
  ) then
    return jsonb_build_object('ok', true, 'kind', 'already_enrolled', 'className', cname);
  end if;

  insert into public.enrollments (organization_id, class_id, student_id)
  values (oid, cid, sid);

  return jsonb_build_object('ok', true, 'kind', 'joined', 'className', cname);
end;
$$;

revoke all on function public.student_join_class_by_code(text) from public;
grant execute on function public.student_join_class_by_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: linked students can read their roster data across orgs
-- ---------------------------------------------------------------------------
drop policy if exists "students_select_linked_self" on public.students;
create policy "students_select_linked_self" on public.students
for select using (linked_user_id = auth.uid());

drop policy if exists "enrollments_select_linked_student" on public.enrollments;
create policy "enrollments_select_linked_student" on public.enrollments
for select using (
  exists (
    select 1
    from public.students s
    where s.id = enrollments.student_id
      and s.linked_user_id = auth.uid()
  )
);

drop policy if exists "classes_select_linked_student" on public.classes;
create policy "classes_select_linked_student" on public.classes
for select using (
  exists (
    select 1
    from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.class_id = classes.id
      and s.linked_user_id = auth.uid()
  )
);

drop policy if exists "organizations_select_linked_student" on public.organizations;
create policy "organizations_select_linked_student" on public.organizations
for select using (
  exists (
    select 1
    from public.classes c
    join public.enrollments e on e.class_id = c.id
    join public.students s on s.id = e.student_id
    where c.organization_id = organizations.id
      and s.linked_user_id = auth.uid()
  )
);
