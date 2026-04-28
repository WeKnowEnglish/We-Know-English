-- Add class team roles and enforce assistant attendance limitations.

do $$ begin
  create type public.class_teacher_role as enum ('co_teacher', 'assistant');
exception
  when duplicate_object then null;
end $$;

alter table public.class_teachers
  add column if not exists role public.class_teacher_role not null default 'co_teacher';

create index if not exists class_teachers_class_role_idx on public.class_teachers (class_id, role);

create or replace function public.save_attendance_bundle(
  p_organization_id uuid,
  p_class_id uuid,
  p_session_id uuid,
  p_occurrence_key text,
  p_session_date date,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_ok boolean;
  v_is_lead boolean := false;
  v_team_role public.class_teacher_role;
  v_existing_count integer := 0;
  elem jsonb;
  v_student_id uuid;
  v_status text;
  v_status_e public.attendance_status;
  v_key text := nullif(trim(coalesce(p_occurrence_key, '')), '');
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id and m.profile_id = v_uid
  ) into v_ok;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  end if;

  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.organization_id = p_organization_id
  ) into v_ok;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'error', 'Class not found');
  end if;

  select exists (
    select 1
    from public.classes c
    where c.id = p_class_id
      and c.organization_id = p_organization_id
      and c.tutor_id = v_uid
  ) into v_is_lead;

  if not v_is_lead then
    select ct.role into v_team_role
    from public.class_teachers ct
    where ct.organization_id = p_organization_id
      and ct.class_id = p_class_id
      and ct.profile_id = v_uid
    limit 1;
  end if;

  if not v_is_lead and v_team_role is null then
    return jsonb_build_object('ok', false, 'error', 'You do not have attendance access to this class');
  end if;

  if p_session_id is null then
    if v_key is not null then
      select s.id into v_sid
      from public.sessions s
      where s.organization_id = p_organization_id
        and s.class_id = p_class_id
        and s.occurrence_key = v_key
      limit 1;
    end if;

    if v_sid is null then
      insert into public.sessions (
        organization_id,
        class_id,
        session_date,
        status,
        occurrence_key,
        attendance_finalized
      )
      values (
        p_organization_id,
        p_class_id,
        p_session_date,
        'scheduled',
        v_key,
        false
      )
      returning id into v_sid;
    end if;
  else
    select s.id into v_sid
    from public.sessions s
    where s.id = p_session_id
      and s.organization_id = p_organization_id
      and s.class_id = p_class_id;
    if v_sid is null then
      return jsonb_build_object('ok', false, 'error', 'Session not found');
    end if;
    if v_key is not null then
      update public.sessions s
      set occurrence_key = coalesce(s.occurrence_key, v_key)
      where s.id = v_sid and s.occurrence_key is null;
    end if;
  end if;

  select count(*)::int into v_existing_count
  from public.attendance_records ar
  where ar.organization_id = p_organization_id
    and ar.session_id = v_sid;

  if v_team_role = 'assistant' and v_existing_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'Assistants cannot modify previously saved attendance.');
  end if;

  update public.sessions s
  set session_date = p_session_date
  where s.id = v_sid
    and coalesce(s.attendance_finalized, false) = false
    and s.session_date is distinct from p_session_date;

  for elem in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_student_id := (elem ->> 'student_id')::uuid;
    v_status := lower(trim(coalesce(elem ->> 'status', '')));

    v_status_e := case v_status
      when 'present' then 'present'::public.attendance_status
      when 'late' then 'late'::public.attendance_status
      when 'absent_excused' then 'absent_excused'::public.attendance_status
      when 'absent_unexcused' then 'absent_unexcused'::public.attendance_status
      when 'absent' then 'absent_unexcused'::public.attendance_status
      else null
    end;
    if v_status_e is null then
      return jsonb_build_object('ok', false, 'error', 'Invalid attendance status: ' || coalesce(v_status, ''));
    end if;

    select exists (
      select 1 from public.enrollments e
      where e.organization_id = p_organization_id
        and e.class_id = p_class_id
        and e.student_id = v_student_id
    ) into v_ok;
    if not coalesce(v_ok, false) then
      return jsonb_build_object('ok', false, 'error', 'Student not enrolled in this class');
    end if;

    insert into public.attendance_records (
      organization_id,
      session_id,
      student_id,
      status,
      marked_at,
      marked_by
    )
    values (
      p_organization_id,
      v_sid,
      v_student_id,
      v_status_e,
      now(),
      v_uid
    )
    on conflict (session_id, student_id) do update set
      status = excluded.status,
      marked_at = now(),
      marked_by = excluded.marked_by;
  end loop;

  return jsonb_build_object('ok', true, 'session_id', v_sid);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

create or replace function public.finalize_attendance_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
  v_org uuid;
  v_class_id uuid;
  v_is_lead boolean := false;
  v_team_role public.class_teacher_role;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select s.organization_id, s.class_id into v_org, v_class_id
  from public.sessions s
  where s.id = p_session_id;
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'Session not found');
  end if;

  select exists (
    select 1 from public.organization_members m
    where m.organization_id = v_org and m.profile_id = v_uid
  ) into v_ok;
  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'error', 'Not a member of this organization');
  end if;

  select exists (
    select 1 from public.classes c
    where c.id = v_class_id
      and c.organization_id = v_org
      and c.tutor_id = v_uid
  ) into v_is_lead;

  if not v_is_lead then
    select ct.role into v_team_role
    from public.class_teachers ct
    where ct.organization_id = v_org
      and ct.class_id = v_class_id
      and ct.profile_id = v_uid
    limit 1;
  end if;

  if not v_is_lead and v_team_role is distinct from 'co_teacher'::public.class_teacher_role then
    return jsonb_build_object('ok', false, 'error', 'Only lead teachers and co-teachers can finalize attendance.');
  end if;

  update public.sessions
  set
    attendance_finalized = true,
    status = 'completed',
    attendance_finalized_by = v_uid
  where id = p_session_id and organization_id = v_org;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;
