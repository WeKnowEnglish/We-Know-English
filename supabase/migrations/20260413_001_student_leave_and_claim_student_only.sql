-- Only student profiles may claim roster rows by email (avoid teachers linking to student emails).
-- Students may remove themselves from a class enrollment (join/leave self-serve).

create or replace function public.claim_student_accounts_on_signup()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  em text;
  updated_count int := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  if (select p.app_role::text from public.profiles p where p.id = auth.uid()) is distinct from 'student' then
    return 0;
  end if;

  select lower(trim(u.email)) into em from auth.users u where u.id = auth.uid();
  if em is null or em = '' then
    return 0;
  end if;

  update public.students s
  set
    linked_user_id = auth.uid(),
    profile = coalesce(s.profile, '{}'::jsonb)
      || jsonb_build_object('accountStatus', 'active', 'lastLoginAt', to_jsonb((now() at time zone 'utc')::text))
  where lower(trim(s.email)) = em
    and (s.linked_user_id is null or s.linked_user_id = auth.uid());

  get diagnostics updated_count = ROW_COUNT;
  return updated_count;
end;
$$;

create or replace function public.leave_class_enrollment_as_student(p_class_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  sid uuid;
  cname text;
  deleted int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'You need to be signed in.');
  end if;

  if (select p.app_role::text from public.profiles p where p.id = v_uid) is distinct from 'student' then
    return jsonb_build_object('ok', false, 'error', 'Only student accounts can leave a class this way.');
  end if;

  select s.id, c.name
    into sid, cname
  from public.enrollments e
  join public.students s on s.id = e.student_id
  join public.classes c on c.id = e.class_id
  where e.class_id = p_class_id
    and s.linked_user_id = v_uid
  limit 1;

  if sid is null then
    return jsonb_build_object('ok', false, 'error', 'You are not enrolled in this class.');
  end if;

  delete from public.enrollments e
  where e.class_id = p_class_id and e.student_id = sid;

  get diagnostics deleted = ROW_COUNT;
  if deleted = 0 then
    return jsonb_build_object('ok', false, 'error', 'Could not update enrollment.');
  end if;

  return jsonb_build_object('ok', true, 'className', coalesce(cname, 'Class'));
end;
$$;

revoke all on function public.leave_class_enrollment_as_student(uuid) from public;
grant execute on function public.leave_class_enrollment_as_student(uuid) to authenticated;
