-- Allow organization members to view member directories within their organizations.

drop policy if exists "org_members_select_own_membership" on public.organization_members;
create policy "org_members_select_org_members" on public.organization_members
for select using (
  organization_id in (select public.current_user_org_ids())
);

drop policy if exists "profiles_select_org_members" on public.profiles;
create policy "profiles_select_org_members" on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members om
    where om.profile_id = profiles.id
      and om.organization_id in (select public.current_user_org_ids())
  )
);
