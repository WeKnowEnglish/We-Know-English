-- Attendance reporting: migrate legacy absent rows, marked_by, session columns, RPCs.
-- Enum values are added in 20260420_000_attendance_enum_values.sql (separate commit).

-- ---------------------------------------------------------------------------
-- Migrate legacy 'absent' -> 'absent_unexcused' (requires 000 migration applied first)
-- ---------------------------------------------------------------------------
update public.attendance_records
set status = 'absent_unexcused'::public.attendance_status
where status = 'absent'::public.attendance_status;

-- ---------------------------------------------------------------------------
-- attendance_records.marked_by
-- ---------------------------------------------------------------------------
alter table public.attendance_records
  add column if not exists marked_by uuid references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- sessions: occurrence_key + attendance_finalized
-- ---------------------------------------------------------------------------
alter table public.sessions
  add column if not exists occurrence_key text;

alter table public.sessions
  add column if not exists attendance_finalized boolean not null default false;

create unique index if not exists sessions_org_class_occurrence_uidx
  on public.sessions (organization_id, class_id, occurrence_key)
  where occurrence_key is not null and trim(occurrence_key) <> '';

create index if not exists sessions_org_class_date_idx
  on public.sessions (organization_id, class_id, session_date desc);

-- ---------------------------------------------------------------------------
-- RPC: save bundle (ensure session + upsert rows)
-- ---------------------------------------------------------------------------
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

revoke all on function public.save_attendance_bundle(uuid, uuid, uuid, text, date, jsonb) from public;
grant execute on function public.save_attendance_bundle(uuid, uuid, uuid, text, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: finalize session (billing-friendly completed state)
-- ---------------------------------------------------------------------------
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
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select s.organization_id into v_org
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

  update public.sessions
  set
    attendance_finalized = true,
    status = 'completed'
  where id = p_session_id and organization_id = v_org;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.finalize_attendance_session(uuid) from public;
grant execute on function public.finalize_attendance_session(uuid) to authenticated;
