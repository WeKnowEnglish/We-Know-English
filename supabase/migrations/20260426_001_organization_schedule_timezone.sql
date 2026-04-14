-- IANA timezone for each organization's class schedules (weekly timeLocal, session_date alignment).

alter table public.organizations
  add column if not exists schedule_timezone text not null default 'Asia/Bangkok';

comment on column public.organizations.schedule_timezone is
  'IANA TZ for interpreting weekly timeLocal and calendar session_date (e.g. Asia/Bangkok).';

-- RLS does not grant updates on organizations; use SECURITY DEFINER RPC for owner/staff.
create or replace function public.update_organization_schedule_timezone(
  p_organization_id uuid,
  p_schedule_timezone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := trim(coalesce(p_schedule_timezone, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if v_tz = '' or length(v_tz) > 64 then
    raise exception 'Invalid timezone';
  end if;
  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.profile_id = auth.uid()
      and om.role in ('owner', 'staff')
  ) then
    raise exception 'Not allowed';
  end if;

  update public.organizations
  set schedule_timezone = v_tz
  where id = p_organization_id;
end;
$$;

revoke all on function public.update_organization_schedule_timezone(uuid, text) from public;
grant execute on function public.update_organization_schedule_timezone(uuid, text) to authenticated;
