-- Fix infinite recursion in class-feed select policies by avoiding direct
-- organization_members table reads inside policy expressions.

create or replace function public.is_org_member(p_organization_id uuid)
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

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;

drop policy if exists "feed_posts_select_by_member_class_or_tagged_student" on public.feed_posts;
create policy "feed_posts_select_by_member_class_or_tagged_student" on public.feed_posts
for select using (
  public.is_org_member(organization_id)
  or (
    status = 'published'::public.feed_post_status
    and visibility = 'parent_visible'::public.feed_post_visibility
    and exists (
      select 1
      from public.class_post_students cps
      join public.students s on s.id = cps.student_id
      where cps.post_id = feed_posts.id
        and s.linked_user_id = auth.uid()
    )
  )
);

drop policy if exists "class_post_media_select" on public.class_post_media;
create policy "class_post_media_select" on public.class_post_media
for select using (
  public.is_org_member(organization_id)
  or exists (
    select 1
    from public.class_post_students cps
    join public.students s on s.id = cps.student_id
    where cps.post_id = class_post_media.post_id
      and s.linked_user_id = auth.uid()
  )
);

drop policy if exists "class_post_students_select" on public.class_post_students;
create policy "class_post_students_select" on public.class_post_students
for select using (
  public.is_org_member(organization_id)
  or exists (
    select 1
    from public.students s
    where s.id = class_post_students.student_id
      and s.linked_user_id = auth.uid()
  )
);

drop policy if exists "class_post_tags_select" on public.class_post_tags;
create policy "class_post_tags_select" on public.class_post_tags
for select using (
  public.is_org_member(organization_id)
  or exists (
    select 1
    from public.class_post_students cps
    join public.students s on s.id = cps.student_id
    where cps.post_id = class_post_tags.post_id
      and s.linked_user_id = auth.uid()
  )
);
