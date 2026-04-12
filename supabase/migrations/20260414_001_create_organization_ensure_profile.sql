-- create_organization: ensure public.profiles row exists before organization_members insert.
-- Fixes FK violation for users who existed in auth.users before the profile trigger or without a profile row.

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

  insert into public.profiles (id, full_name, role, app_role)
  select
    au.id,
    coalesce(nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(au.email, ''), '@', 1), 'Member'),
    'tutor'::public.profile_role,
    case
      when coalesce(au.raw_user_meta_data ->> 'app_role', '') = 'teacher' then 'teacher'::public.app_role
      else 'student'::public.app_role
    end
  from auth.users au
  where au.id = auth.uid()
  on conflict (id) do nothing;

  insert into public.organizations (name)
  values (trim(org_name))
  returning id into new_org_id;

  insert into public.organization_members (organization_id, profile_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;
