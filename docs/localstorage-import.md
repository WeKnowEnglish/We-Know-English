# Importing data from browser localStorage into Supabase

Your tracker previously stored classes, students, and enrollments under these keys:

- `wke:students` — JSON array of student objects (string `id` fields like `stu_…`)
- `wke:classes` — JSON array of class objects (string `id` fields like `class_…`)
- `wke:class_enrollments` — JSON array of `{ studentId, classId, joinedAt }`

Supabase uses **UUID** primary keys and rows are scoped by **`organization_id`**.

## Recommended steps

1. **Apply migrations** in `supabase/migrations/` to your Supabase project (including `20260411_004_org_tracker_extensions.sql`).
2. **Log in as your teacher account** in the deployed or local app and **create an organization** (first-run flow on `/onboarding` if you have no org yet). Note your active org: it is the one shown in the header after creation.
3. **Copy localStorage JSON** from the browser:
   - Open DevTools → Application → Local Storage → your site origin.
   - Copy the values for `wke:students`, `wke:classes`, and `wke:class_enrollments`.
4. Save them into one JSON file, for example:

```json
{
  "students": [ /* pasted wke:students array */ ],
  "classes": [ /* pasted wke:classes array */ ],
  "enrollments": [ /* pasted wke:class_enrollments array */ ]
}
```

5. **Run the import script** (requires [Supabase service role key](https://supabase.com/docs/guides/api/api-keys) — keep it secret; never commit it):

```bash
cd apps/web
set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
set WKE_IMPORT_ORG_ID=paste-organization-uuid-from-dashboard-or-app
node scripts/import-wke-localstorage.mjs path/to/export.json
```

The script prints progress and maps old string IDs to new UUIDs so enrollments stay consistent.

6. **Clear localStorage** keys `wke:students`, `wke:classes`, and `wke:class_enrollments` in the browser so the old client-only data is not confused with server data.

7. **Refresh** the app; teacher pages load from Supabase under your organization.

## If you cannot use the service role

Use the Supabase SQL editor or Table Editor to insert rows manually following the same field mapping as in `scripts/import-wke-localstorage.mjs`, or ask an admin to run the script in a trusted environment.
