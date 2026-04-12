-- Teachers can search all organizations by name and join as staff (no duplicate orgs for same center).

create or replace function public.search_organizations_for_teachers(p_query text, p_limit int default 40)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if (select pr.app_role::text from public.profiles pr where pr.id = auth.uid()) is distinct from 'teacher' then
    return;
  end if;

  p_limit := greatest(1, least(coalesce(p_limit, 40), 100));

  if coalesce(trim(p_query), '') = '' then
    return query
      select o.id, o.name
      from public.organizations o
      order by o.created_at desc
      limit p_limit;
  else
    return query
      select o.id, o.name
      from public.organizations o
      where o.name ilike '%' || trim(p_query) || '%'
      order by o.created_at desc
      limit p_limit;
  end if;
end;
$$;

revoke all on function public.search_organizations_for_teachers(text, int) from public;
grant execute on function public.search_organizations_for_teachers(text, int) to authenticated;

create or replace function public.join_organization_as_staff(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_mem_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  if (select pr.app_role::text from public.profiles pr where pr.id = auth.uid()) is distinct from 'teacher' then
    return jsonb_build_object('ok', false, 'error', 'Only teacher accounts can join an organization this way.');
  end if;

  if not exists (select 1 from public.organizations o where o.id = p_organization_id) then
    return jsonb_build_object('ok', false, 'error', 'Organization not found.');
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

  insert into public.organization_members (organization_id, profile_id, role)
  values (p_organization_id, auth.uid(), 'staff'::public.member_role)
  on conflict (organization_id, profile_id) do nothing
  returning id into new_mem_id;

  if new_mem_id is not null then
    return jsonb_build_object('ok', true, 'kind', 'joined', 'organization_id', p_organization_id);
  end if;

  return jsonb_build_object('ok', true, 'kind', 'already_member', 'organization_id', p_organization_id);
end;
$$;

revoke all on function public.join_organization_as_staff(uuid) from public;
grant execute on function public.join_organization_as_staff(uuid) to authenticated;
