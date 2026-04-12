-- Simple app roles: teacher | student (profiles.app_role)
-- Auto-create profile on signup from auth.users metadata.

do $$ begin
  create type public.app_role as enum ('teacher', 'student');
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists app_role public.app_role not null default 'teacher';

-- New signups default to student in app logic; existing rows stay teacher
update public.profiles set app_role = 'teacher' where app_role is null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.app_role;
begin
  if coalesce(new.raw_user_meta_data->>'app_role', '') = 'teacher' then
    r := 'teacher'::public.app_role;
  else
    r := 'student'::public.app_role;
  end if;

  insert into public.profiles (id, full_name, role, app_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'tutor'::public.profile_role,
    r
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        app_role = excluded.app_role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();
