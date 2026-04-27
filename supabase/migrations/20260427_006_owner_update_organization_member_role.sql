-- Owners can update organization member roles from the member directory.

create or replace function public.update_organization_member_role(
  p_organization_id uuid,
  p_profile_id uuid,
  p_role public.member_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_current_role public.member_role;
  v_owner_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.profile_id = v_uid
      and m.role = 'owner'::public.member_role
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only organization admins can update roles.');
  end if;

  select m.role into v_current_role
  from public.organization_members m
  where m.organization_id = p_organization_id
    and m.profile_id = p_profile_id;

  if v_current_role is null then
    return jsonb_build_object('ok', false, 'error', 'Member not found in this organization.');
  end if;

  if v_current_role = 'owner'::public.member_role and p_role <> 'owner'::public.member_role then
    select count(*)::int into v_owner_count
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.role = 'owner'::public.member_role;

    if v_owner_count <= 1 then
      return jsonb_build_object('ok', false, 'error', 'Cannot demote the last admin.');
    end if;
  end if;

  update public.organization_members
  set role = p_role
  where organization_id = p_organization_id
    and profile_id = p_profile_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_organization_member_role(uuid, uuid, public.member_role) from public;
grant execute on function public.update_organization_member_role(uuid, uuid, public.member_role) to authenticated;
