-- When saving attendance, align sessions.session_date with the bundle if the session is still a draft.
-- Fixes rows created with UTC calendar day vs the teacher's local class day; next save updates the row.

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
