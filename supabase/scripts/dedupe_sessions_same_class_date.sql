-- =============================================================================
-- One-time cleanup: duplicate `sessions` rows (same org + class + session_date)
-- =============================================================================
--
-- Use when timezone mismatches (e.g. Vercel UTC vs browser ICT) created two
-- session rows for the same class meeting. Keeps a single "winner" per group
-- and deletes the rest. `attendance_records` CASCADE-delete with removed sessions.
--
-- COMMENT SYNTAX (Supabase / PostgreSQL):
--   • Block comments are ONLY  /*   ...   */   (slash-star, star-slash).
--   • Do NOT use  / ... /  — that is invalid and will error.
--   • Line comments use  -- at the start of a line.
--   • To run a PREVIEW: remove the opening /* and closing */ around that block,
--     OR copy just that SELECT (with its WITH params …) into the editor and Run.
--
-- LIMITATIONS (read before running):
--   • If you legitimately hold TWO different meetings the SAME calendar day for
--     the SAME class_id, this script would incorrectly delete one. (Uncommon.)
--   • Duplicates that landed on DIFFERENT session_date (UTC midnight boundary)
--     are NOT grouped here — run the preview queries, then fix those manually
--     or extend the rule.
--
-- HOW TO RUN (Supabase SQL Editor):
--   1) In each PREVIEW block, replace the uuid in WITH params AS (...) ONCE.
--   2) Uncomment that block (delete /* before WITH and */ after the semicolon),
--      or paste only that block, then Run.
--   3) In section 3, set v_org to the same uuid, run the DO $$ ... END $$; once.
--   4) Read the NOTICE for how many rows were deleted. Re-check /attendance/missed.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PREVIEW: groups with more than one session
-- -----------------------------------------------------------------------------
/*
WITH params AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS org_id
  -- ^ REPLACE with your organizations.id from Supabase Table Editor (keep quotes)
)
SELECT
  s.organization_id,
  s.class_id,
  c.name AS class_name,
  s.session_date,
  COUNT(*) AS session_count,
  ARRAY_AGG(s.id ORDER BY s.created_at) AS session_ids,
  ARRAY_AGG(s.occurrence_key ORDER BY s.created_at) AS occurrence_keys,
  ARRAY_AGG(s.attendance_finalized ORDER BY s.created_at) AS finalized_flags
FROM public.sessions s
JOIN public.classes c ON c.id = s.class_id AND c.organization_id = s.organization_id
CROSS JOIN params p
WHERE s.organization_id = p.org_id
GROUP BY s.organization_id, s.class_id, c.name, s.session_date
HAVING COUNT(*) > 1
ORDER BY s.session_date DESC, c.name;
*/

-- -----------------------------------------------------------------------------
-- 2) PREVIEW: which row would be KEPT (rn = 1) vs DELETED (rn > 1)
-- -----------------------------------------------------------------------------
/*
WITH params AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS org_id
  -- ^ REPLACE with the same organizations.id as in preview 1
),
ranked AS (
  SELECT
    s.id,
    s.organization_id,
    s.class_id,
    s.session_date,
    s.occurrence_key,
    s.attendance_finalized,
    s.created_at,
    (SELECT COUNT(*)::bigint FROM public.attendance_records ar WHERE ar.session_id = s.id) AS roster_rows,
    ROW_NUMBER() OVER (
      PARTITION BY s.organization_id, s.class_id, s.session_date
      ORDER BY
        COALESCE(s.attendance_finalized, false) DESC,
        (SELECT COUNT(*)::bigint FROM public.attendance_records ar WHERE ar.session_id = s.id) DESC,
        s.created_at DESC
    ) AS rn
  FROM public.sessions s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
)
SELECT
  r.rn,
  r.id AS session_id,
  r.session_date,
  r.attendance_finalized,
  r.roster_rows,
  r.created_at,
  LEFT(r.occurrence_key, 80) AS occurrence_key_prefix
FROM ranked r
WHERE r.rn > 1
   OR (
     r.rn = 1
     AND EXISTS (
       SELECT 1 FROM ranked r2
       WHERE r2.organization_id = r.organization_id
         AND r2.class_id = r.class_id
         AND r2.session_date = r.session_date
         AND r2.rn > 1
     )
   )
ORDER BY r.session_date DESC, r.class_id, r.rn;
*/

-- -----------------------------------------------------------------------------
-- 3) DELETE duplicates — set v_org below, then run this entire block once
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_org uuid := '00000000-0000-0000-0000-000000000000';  -- REPLACE with your organizations.id
  deleted_count int;
BEGIN
  IF v_org = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Set v_org to your real organization_id before running.';
  END IF;

  WITH ranked AS (
    SELECT
      s.id,
      ROW_NUMBER() OVER (
        PARTITION BY s.organization_id, s.class_id, s.session_date
        ORDER BY
          COALESCE(s.attendance_finalized, false) DESC,
          (SELECT COUNT(*)::bigint FROM public.attendance_records ar WHERE ar.session_id = s.id) DESC,
          s.created_at DESC
      ) AS rn
    FROM public.sessions s
    WHERE s.organization_id = v_org
  ),
  doomed AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  DELETE FROM public.sessions s
  WHERE s.id IN (SELECT id FROM doomed);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate session row(s) for org %.', deleted_count, v_org;
END $$;
