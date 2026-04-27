-- Owners can permanently delete their organization (cascade).

create or replace function public.delete_organization_as_owner(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not signed in');
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.role = 'owner'::public.member_role
  ) then
    return jsonb_build_object('ok', false, 'error', 'Only organization admins can delete this organization.');
  end if;

  delete from public.organizations o
  where o.id = p_organization_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Organization not found.');
  end if;

  update public.profiles
  set last_active_organization_id = null
  where id = auth.uid()
    and last_active_organization_id = p_organization_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_organization_as_owner(uuid) from public;
grant execute on function public.delete_organization_as_owner(uuid) to authenticated;
