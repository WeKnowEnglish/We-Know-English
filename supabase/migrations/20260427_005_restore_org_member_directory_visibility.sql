-- Restore organization member directory visibility without recursive RLS.
-- Uses a SECURITY DEFINER helper to check org membership safely.

create or replace function public.is_member_of_org(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = p_organization_id
      and om.profile_id = auth.uid()
  );
$$;

revoke all on function public.is_member_of_org(uuid) from public;
grant execute on function public.is_member_of_org(uuid) to authenticated;

drop policy if exists "org_members_select_own_membership" on public.organization_members;
drop policy if exists "org_members_select_org_members" on public.organization_members;

create policy "org_members_select_org_members" on public.organization_members
for select using (
  profile_id = auth.uid()
  or public.is_member_of_org(organization_id)
);
