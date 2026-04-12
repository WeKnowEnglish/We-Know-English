-- New enum values must be committed before use (PG 55P04). This file runs alone; do not reference new values here.

alter type public.attendance_status add value if not exists 'absent_excused';
alter type public.attendance_status add value if not exists 'absent_unexcused';
