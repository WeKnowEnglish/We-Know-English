-- Backfill public.profiles for auth users missing a row (e.g. created before trigger, via dashboard, or failed trigger).
-- Same defaults as create_organization / handle_new_user_profile.

create or replace function public.ensure_my_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
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
end;
$$;

revoke all on function public.ensure_my_profile() from public;
grant execute on function public.ensure_my_profile() to authenticated;
