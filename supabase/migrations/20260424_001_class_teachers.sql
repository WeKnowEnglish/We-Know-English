-- Co-teachers: additional teachers per class (primary remains classes.tutor_id).

create table if not exists public.class_teachers (
  id uuid primary key default gen_random_uuid (),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now (),
  unique (class_id, profile_id)
);

create index if not exists class_teachers_org_profile_idx on public.class_teachers (organization_id, profile_id);
create index if not exists class_teachers_class_idx on public.class_teachers (class_id);

insert into public.class_teachers (organization_id, class_id, profile_id)
select c.organization_id, c.id, c.tutor_id
from public.classes c
where c.tutor_id is not null
on conflict (class_id, profile_id) do nothing;

alter table public.class_teachers enable row level security;

create policy "class_teachers_select_org_members" on public.class_teachers for
select using (organization_id in (select public.current_user_org_ids ()));

create policy "class_teachers_modify_owner_or_primary_tutor" on public.class_teachers for all using (
  organization_id in (select public.current_user_org_ids ())
  and (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = class_teachers.organization_id
        and m.profile_id = auth.uid ()
        and m.role = 'owner'
    )
    or exists (
      select 1
      from public.classes c
      where c.id = class_teachers.class_id
        and c.tutor_id = auth.uid ()
    )
  )
)
with check (
  organization_id in (select public.current_user_org_ids ())
  and (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = class_teachers.organization_id
        and m.profile_id = auth.uid ()
        and m.role = 'owner'
    )
    or exists (
      select 1
      from public.classes c
      where c.id = class_teachers.class_id
        and c.tutor_id = auth.uid ()
    )
  )
);
