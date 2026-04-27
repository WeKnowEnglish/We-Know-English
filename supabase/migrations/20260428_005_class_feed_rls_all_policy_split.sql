-- Resolve feed_posts recursion:
-- class_post_* "FOR ALL" policies include subqueries to feed_posts.
-- Because ALL applies to SELECT too, feed_posts -> class_post_students -> feed_posts loops.
-- Split mutation policies into INSERT/UPDATE/DELETE only.

-- class_post_media
drop policy if exists "class_post_media_modify" on public.class_post_media;

create policy "class_post_media_insert" on public.class_post_media
for insert with check (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_media.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

create policy "class_post_media_update" on public.class_post_media
for update using (
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

create policy "class_post_media_delete" on public.class_post_media
for delete using (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_media.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

-- class_post_students
drop policy if exists "class_post_students_modify" on public.class_post_students;

create policy "class_post_students_insert" on public.class_post_students
for insert with check (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_students.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

create policy "class_post_students_update" on public.class_post_students
for update using (
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

create policy "class_post_students_delete" on public.class_post_students
for delete using (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_students.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

-- class_post_tags
drop policy if exists "class_post_tags_modify" on public.class_post_tags;

create policy "class_post_tags_insert" on public.class_post_tags
for insert with check (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_tags.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);

create policy "class_post_tags_update" on public.class_post_tags
for update using (
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

create policy "class_post_tags_delete" on public.class_post_tags
for delete using (
  exists (
    select 1
    from public.feed_posts fp
    where fp.id = class_post_tags.post_id
      and public.can_edit_class_feed(fp.organization_id, fp.class_id)
  )
);
