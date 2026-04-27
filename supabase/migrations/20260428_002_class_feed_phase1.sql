-- Phase 1: class feed source-of-truth with draft/publish workflow.

do $$ begin
  create type public.feed_post_visibility as enum ('internal', 'parent_visible');
exception
  when duplicate_object then null;
end $$;

alter table public.feed_posts
  add column if not exists class_id uuid references public.classes (id) on delete set null,
  add column if not exists title text,
  add column if not exists visibility public.feed_post_visibility not null default 'internal',
  add column if not exists pinned boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists published_by uuid references public.profiles (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists feed_posts_org_class_created_idx
  on public.feed_posts (organization_id, class_id, created_at desc);

create index if not exists feed_posts_status_created_idx
  on public.feed_posts (status, created_at desc);

create table if not exists public.class_post_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  width int,
  height int,
  duration_ms int,
  thumbnail_path text,
  sort_order int not null default 0,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists class_post_media_post_sort_idx
  on public.class_post_media (post_id, sort_order, created_at);

create table if not exists public.class_post_students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, student_id)
);

create index if not exists class_post_students_student_idx
  on public.class_post_students (student_id, created_at desc);

create table if not exists public.class_post_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  post_id uuid not null references public.feed_posts (id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (post_id, tag)
);

create table if not exists public.skill_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.skill_categories (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (category_id, organization_id, slug)
);

insert into public.skill_categories (slug, name, sort_order)
values
  ('reading', 'Reading', 10),
  ('writing', 'Writing', 20),
  ('speaking', 'Speaking', 30),
  ('listening', 'Listening', 40),
  ('phonics', 'Phonics', 50),
  ('grammar', 'Grammar', 60),
  ('vocabulary', 'Vocabulary', 70)
on conflict (slug) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order;

-- Storage bucket for class media uploads.
insert into storage.buckets (id, name, public)
values ('class-media', 'class-media', false)
on conflict (id) do nothing;

create or replace function public.can_edit_class_feed(
  p_organization_id uuid,
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.organization_id = p_organization_id
      and c.tutor_id = auth.uid()
  )
  or exists (
    select 1
    from public.class_teachers ct
    where ct.organization_id = p_organization_id
      and ct.class_id = p_class_id
      and ct.profile_id = auth.uid()
      and ct.role in ('co_teacher'::public.class_teacher_role, 'assistant'::public.class_teacher_role)
  );
$$;

create or replace function public.can_publish_class_feed(
  p_organization_id uuid,
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.organization_id = p_organization_id
      and c.tutor_id = auth.uid()
  )
  or exists (
    select 1
    from public.class_teachers ct
    where ct.organization_id = p_organization_id
      and ct.class_id = p_class_id
      and ct.profile_id = auth.uid()
      and ct.role = 'co_teacher'::public.class_teacher_role
  );
$$;

create or replace function public.create_class_post_draft(
  p_organization_id uuid,
  p_class_id uuid,
  p_body text,
  p_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  if not public.can_edit_class_feed(p_organization_id, p_class_id) then
    return jsonb_build_object('ok', false, 'error', 'You do not have access to post in this class.');
  end if;

  insert into public.feed_posts (
    organization_id,
    class_id,
    body,
    title,
    status,
    visibility,
    created_by,
    updated_at
  )
  values (
    p_organization_id,
    p_class_id,
    coalesce(nullif(trim(p_body), ''), ''),
    nullif(trim(coalesce(p_title, '')), ''),
    'draft'::public.feed_post_status,
    'internal'::public.feed_post_visibility,
    auth.uid(),
    now()
  )
  returning id into v_post_id;

  return jsonb_build_object('ok', true, 'post_id', v_post_id);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

create or replace function public.update_class_post_draft(
  p_post_id uuid,
  p_body text,
  p_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_class_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select fp.organization_id, fp.class_id
  into v_org_id, v_class_id
  from public.feed_posts fp
  where fp.id = p_post_id
    and fp.archived_at is null;

  if v_org_id is null or v_class_id is null then
    return jsonb_build_object('ok', false, 'error', 'Post not found');
  end if;

  if not public.can_edit_class_feed(v_org_id, v_class_id) then
    return jsonb_build_object('ok', false, 'error', 'You do not have access to edit this post.');
  end if;

  update public.feed_posts
  set
    body = coalesce(nullif(trim(p_body), ''), body),
    title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
    updated_at = now()
  where id = p_post_id
    and status = 'draft'::public.feed_post_status
    and archived_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Only draft posts can be edited.');
  end if;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

create or replace function public.publish_class_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_class_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select fp.organization_id, fp.class_id
  into v_org_id, v_class_id
  from public.feed_posts fp
  where fp.id = p_post_id
    and fp.archived_at is null;

  if v_org_id is null or v_class_id is null then
    return jsonb_build_object('ok', false, 'error', 'Post not found');
  end if;

  if not public.can_publish_class_feed(v_org_id, v_class_id) then
    return jsonb_build_object('ok', false, 'error', 'Only lead teachers and co-teachers can publish.');
  end if;

  update public.feed_posts
  set
    status = 'published'::public.feed_post_status,
    visibility = 'parent_visible'::public.feed_post_visibility,
    published_at = now(),
    published_by = auth.uid(),
    updated_at = now()
  where id = p_post_id
    and status = 'draft'::public.feed_post_status
    and archived_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Only draft posts can be published.');
  end if;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

create or replace function public.archive_class_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_class_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select fp.organization_id, fp.class_id
  into v_org_id, v_class_id
  from public.feed_posts fp
  where fp.id = p_post_id
    and fp.archived_at is null;

  if v_org_id is null or v_class_id is null then
    return jsonb_build_object('ok', false, 'error', 'Post not found');
  end if;

  if not public.can_publish_class_feed(v_org_id, v_class_id) then
    return jsonb_build_object('ok', false, 'error', 'Only lead teachers and co-teachers can archive.');
  end if;

  update public.feed_posts
  set
    archived_at = now(),
    updated_at = now()
  where id = p_post_id
    and archived_at is null;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.create_class_post_draft(uuid, uuid, text, text) from public;
grant execute on function public.create_class_post_draft(uuid, uuid, text, text) to authenticated;
revoke all on function public.update_class_post_draft(uuid, text, text) from public;
grant execute on function public.update_class_post_draft(uuid, text, text) to authenticated;
revoke all on function public.publish_class_post(uuid) from public;
grant execute on function public.publish_class_post(uuid) to authenticated;
revoke all on function public.archive_class_post(uuid) from public;
grant execute on function public.archive_class_post(uuid) to authenticated;

alter table public.class_post_media enable row level security;
alter table public.class_post_students enable row level security;
alter table public.class_post_tags enable row level security;
alter table public.skill_categories enable row level security;
alter table public.skills enable row level security;

drop policy if exists "org_data_select_feed_posts" on public.feed_posts;
drop policy if exists "org_data_modify_feed_posts" on public.feed_posts;

create policy "feed_posts_select_by_org_or_tagged_student" on public.feed_posts
for select using (
  organization_id in (select public.current_user_org_ids())
  or (
    status = 'published'::public.feed_post_status
    and visibility = 'parent_visible'::public.feed_post_visibility
    and exists (
      select 1
      from public.class_post_students cps
      join public.students s
        on s.id = cps.student_id
      where cps.post_id = feed_posts.id
        and s.linked_user_id = auth.uid()
    )
  )
);

create policy "feed_posts_insert_by_class_team" on public.feed_posts
for insert with check (
  public.can_edit_class_feed(organization_id, class_id)
);

create policy "feed_posts_update_by_class_team" on public.feed_posts
for update using (
  public.can_edit_class_feed(organization_id, class_id)
)
with check (
  public.can_edit_class_feed(organization_id, class_id)
);

create policy "feed_posts_delete_by_publishers" on public.feed_posts
for delete using (
  public.can_publish_class_feed(organization_id, class_id)
);

create policy "class_post_media_select" on public.class_post_media
for select using (
  organization_id in (select public.current_user_org_ids())
  or exists (
    select 1
    from public.class_post_students cps
    join public.students s on s.id = cps.student_id
    where cps.post_id = class_post_media.post_id
      and s.linked_user_id = auth.uid()
  )
);

create policy "class_post_media_modify" on public.class_post_media
for all using (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_media.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
)
with check (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_media.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

create policy "class_post_students_select" on public.class_post_students
for select using (
  organization_id in (select public.current_user_org_ids())
  or exists (
    select 1
    from public.students s
    where s.id = class_post_students.student_id
      and s.linked_user_id = auth.uid()
  )
);

create policy "class_post_students_modify" on public.class_post_students
for all using (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_students.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
)
with check (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_students.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

create policy "class_post_tags_select" on public.class_post_tags
for select using (
  organization_id in (select public.current_user_org_ids())
  or exists (
    select 1
    from public.class_post_students cps
    join public.students s on s.id = cps.student_id
    where cps.post_id = class_post_tags.post_id
      and s.linked_user_id = auth.uid()
  )
);

create policy "class_post_tags_modify" on public.class_post_tags
for all using (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_tags.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
)
with check (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_tags.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

create policy "skill_categories_read_all" on public.skill_categories
for select using (true);

create policy "skills_select_member" on public.skills
for select using (
  organization_id is null
  or organization_id in (select public.current_user_org_ids())
);

create policy "skills_modify_owner_scope" on public.skills
for all using (
  organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.profile_id = auth.uid()
      and om.role = 'owner'::public.member_role
  )
)
with check (
  organization_id in (
    select om.organization_id
    from public.organization_members om
    where om.profile_id = auth.uid()
      and om.role = 'owner'::public.member_role
  )
);

drop policy if exists "class_media_insert" on storage.objects;
drop policy if exists "class_media_select" on storage.objects;
drop policy if exists "class_media_update" on storage.objects;
drop policy if exists "class_media_delete" on storage.objects;

create policy "class_media_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'class-media');

create policy "class_media_select" on storage.objects
for select to authenticated
using (bucket_id = 'class-media');

create policy "class_media_update" on storage.objects
for update to authenticated
using (bucket_id = 'class-media')
with check (bucket_id = 'class-media');

create policy "class_media_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'class-media');
