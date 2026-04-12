-- Track who finalized a session so "My finalized sessions" can list it even when
-- roster rows were last saved by someone else, or legacy rows have null marked_by.

alter table public.sessions
  add column if not exists attendance_finalized_by uuid references public.profiles (id) on delete set null;

-- Best-effort backfill: last non-null marker on any row for that session.
update public.sessions s
set attendance_finalized_by = x.marked_by
from (
  select distinct on (ar.session_id)
    ar.session_id,
    ar.marked_by
  from public.attendance_records ar
  where ar.marked_by is not null
  order by ar.session_id, ar.marked_at desc nulls last
) x
where s.id = x.session_id
  and coalesce(s.attendance_finalized, false) = true
  and s.attendance_finalized_by is null;

create index if not exists sessions_org_finalized_by_idx
  on public.sessions (organization_id, attendance_finalized_by)
  where attendance_finalized_by is not null and coalesce(attendance_finalized, false) = true;

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
    status = 'completed',
    attendance_finalized_by = v_uid
  where id = p_session_id and organization_id = v_org;

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.finalize_attendance_session(uuid) from public;
grant execute on function public.finalize_attendance_session(uuid) to authenticated;
