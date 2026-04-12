-- Backfill sessions.session_date from weekly occurrence_key slot ids.
--
-- getScheduleEvents encodes the intended local class day as:
--   weekly_<class_id>_<rule_id>_YYYY-MM-DD
-- Older saves sometimes stored session_date as UTC midnight from the ISO tail of the key,
-- or as "today" for catch-up, so the attendance report (which filters on session_date) missed
-- real March (etc.) meetings. This sets session_date to that embedded calendar day.

update public.sessions s
set session_date = v.cal_day
from (
  select
    s2.id,
    (substring(split_part(s2.occurrence_key, '|', 2) from '(\d{4}-\d{2}-\d{2})$'))::date as cal_day
  from public.sessions s2
  where coalesce(trim(s2.occurrence_key), '') <> ''
    and split_part(s2.occurrence_key, '|', 2) ~ '^weekly_.+_\d{4}-\d{2}-\d{2}$'
) v
where s.id = v.id
  and v.cal_day is not null
  and s.session_date is distinct from v.cal_day;
