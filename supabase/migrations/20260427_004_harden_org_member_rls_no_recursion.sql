-- Harden organization member/profile RLS to avoid recursion in organization_members policies.
-- This migration stores the hotfix applied manually in production.

drop policy if exists "org_members_select_org_members" on public.organization_members;
drop policy if exists "org_members_select_own_membership" on public.organization_members;

create policy "org_members_select_own_membership" on public.organization_members
for select using (
  profile_id = auth.uid()
);

drop policy if exists "profiles_select_org_members" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_org_members" on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members viewer
    join public.organization_members target
      on target.organization_id = viewer.organization_id
    where viewer.profile_id = auth.uid()
      and target.profile_id = profiles.id
  )
);
