-- Fix class feed read visibility for class team and org members without relying on current_user_org_ids().

drop policy if exists "feed_posts_select_by_org_or_tagged_student" on public.feed_posts;

create policy "feed_posts_select_by_member_class_or_tagged_student" on public.feed_posts
for select using (
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = feed_posts.organization_id
      and om.profile_id = auth.uid()
  )
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
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = class_post_media.organization_id
      and om.profile_id = auth.uid()
  )
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
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = class_post_students.organization_id
      and om.profile_id = auth.uid()
  )
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
  exists (
    select 1
    from public.organization_members om
    where om.organization_id = class_post_tags.organization_id
      and om.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.class_post_students cps
    join public.students s on s.id = cps.student_id
    where cps.post_id = class_post_tags.post_id
      and s.linked_user_id = auth.uid()
  )
);
