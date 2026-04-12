-- Disambiguate: PL/pgSQL variable `s` (students%ROWTYPE) + SQL table alias `s` made `s.organization_id` ambiguous.
-- Use table alias `st` in SELECTs (same body as 20260418 after fix).

create or replace function public.join_class_by_code(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_display_name text;
  v_code text;
  class_row record;
  v_student_id uuid;
  s public.students%ROWTYPE;
  v_cefr text;
  v_profile jsonb;
  v_avatar text;
  parts text[];
  v_class_name text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'You need to be signed in to join a class.');
  end if;

  if coalesce(trim(p_join_code), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Enter a join code.');
  end if;

  v_code := upper(trim(p_join_code));

  if (select p.app_role::text from public.profiles p where p.id = v_uid) is distinct from 'student' then
    return jsonb_build_object('ok', false, 'error', 'Only student accounts can join a class with a code.');
  end if;

  select lower(trim(u.email)) into v_email from auth.users u where u.id = v_uid;
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'We need your account email to add you to the roster.');
  end if;

  select c.id, c.organization_id, c.name, c.settings
  into class_row
  from public.classes c
  where upper(trim(c.settings->>'joinCode')) = v_code
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Invalid join code.');
  end if;

  v_class_name := class_row.name;

  select s2.id into v_student_id
  from public.students s2
  join public.enrollments e on e.student_id = s2.id and e.class_id = class_row.id
  where s2.organization_id = class_row.organization_id
    and s2.linked_user_id = v_uid;

  if v_student_id is not null then
    return jsonb_build_object('ok', true, 'kind', 'already_enrolled', 'className', v_class_name);
  end if;

  select * into s
  from public.students st
  where st.organization_id = class_row.organization_id
    and st.linked_user_id = v_uid
  limit 1;

  if not found then
    select * into s
    from public.students st
    where st.organization_id = class_row.organization_id
      and lower(trim(coalesce(st.email, ''))) = v_email
    limit 1;
  end if;

  if found then
    if s.linked_user_id is not null and s.linked_user_id <> v_uid then
      return jsonb_build_object('ok', false, 'error', 'This school email is already linked to another sign-in account.');
    end if;

    update public.students st
    set
      linked_user_id = v_uid,
      profile = coalesce(st.profile, '{}'::jsonb)
        || jsonb_build_object(
          'accountStatus', 'active',
          'lastLoginAt', to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
    where st.id = s.id;

    v_student_id := s.id;
  else
    select p.full_name into v_display_name from public.profiles p where p.id = v_uid;
    v_display_name := coalesce(nullif(trim(v_display_name), ''), initcap(replace(split_part(v_email, '@', 1), '.', ' ')));
    if v_display_name is null or trim(v_display_name) = '' then
      v_display_name := 'Student';
    end if;

    v_cefr := coalesce(nullif(trim(coalesce(class_row.settings, '{}'::jsonb)->>'cefrLevel'), ''), 'Beginner');

    parts := regexp_split_to_array(trim(v_display_name), '\s+');
    v_avatar := upper(
      substr(coalesce(parts[1], 'ST'), 1, 1)
      || substr(coalesce(nullif(parts[2], ''), ''), 1, 1)
    );
    if length(trim(v_avatar)) < 2 then
      v_avatar := upper(substr(coalesce(parts[1], 'ST'), 1, 2));
    end if;

    v_profile := jsonb_build_object(
      'gender', 'other',
      'accountStatus', 'active',
      'avatar', v_avatar,
      'level', v_cefr,
      'lastLoginAt', to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'birthday', '2000-01-01'
    );

    insert into public.students (
      organization_id,
      full_name,
      level,
      email,
      birthdate,
      profile,
      skills_points,
      linked_user_id
    )
    values (
      class_row.organization_id,
      v_display_name,
      v_cefr,
      v_email,
      date '2000-01-01',
      v_profile,
      0,
      v_uid
    )
    returning id into v_student_id;
  end if;

  if exists (
    select 1 from public.enrollments e
    where e.class_id = class_row.id and e.student_id = v_student_id
  ) then
    return jsonb_build_object('ok', true, 'kind', 'already_enrolled', 'className', v_class_name);
  end if;

  insert into public.enrollments (organization_id, class_id, student_id)
  values (class_row.organization_id, class_row.id, v_student_id);

  return jsonb_build_object('ok', true, 'kind', 'joined', 'className', v_class_name);

exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;
