# WKE Student Tracker & Parent Portal

## Tech stack

- **Framework:** Next.js (App Router) — current install uses Next 16; aligns with Next 14 App Router patterns
- **Database / auth / storage:** Supabase (PostgreSQL, Auth, Storage)
- **UI:** Tailwind CSS + [shadcn/ui](https://ui.shadcn.com) + Lucide React
- **Payments:** Stripe SDK (monthly invoice generation)

## Development

1. Copy [`.env.example`](.env.example) to `.env.local` and set Supabase and Stripe. Set **`CRON_SECRET` in production** (required for `/api/cron/monthly-billing`).
2. Install dependencies:

```bash
npm install
```

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login` until you sign in or create an account at `/signup`.

## Auth (teachers & students)

- **Sign up** (`/signup`): name, email, password, and role **Teacher** or **Student**.
- **Log in** (`/login`) / **Log out** (header on any page).
- **Supabase**: run migration `20260331_003_auth_teacher_student.sql` so `profiles.app_role` exists and the trigger creates a profile row on signup. In the Supabase dashboard, add **Redirect URLs**: `http://localhost:3000/auth/callback` (and your production URL when you deploy).
- **Routing**: students who open tutor-only URLs (attendance, moments, feed, onboarding, billing) are redirected to `/`.

## Routes

| Route | Purpose |
| --- | --- |
| `/login`, `/signup` | Email/password auth |
| `/` | Hub |
| `/onboarding` | Owner checklist |
| `/attendance` | Bulk attendance (mark all present + kiosk/list) |
| `/parent/pulse` | Daily Pulse — chronological `feed` by `student_id` |
| `/student/skill-tree` | Skill Tree from `skills_points` |
| `/moments` | Moment capture |
| `/feed` | Quick tags → 3-sentence narrative |
| `/billing` | Family ledger demo |
| `/billing/monthly` | Monthly Stripe invoice server action |
| `GET /api/cron/monthly-billing?organizationId=…` | Cron hook — **production** requires `CRON_SECRET` and `Authorization: Bearer <CRON_SECRET>` |

## Supabase

- Base schema + RLS: `../../supabase/migrations/20260331_001_mvp_schema.sql`
- Portal extensions (`profiles.role`, `feed` table, Stripe fields, etc.): `../../supabase/migrations/20260331_002_wke_portal_schema.sql`
- Teacher/student roles + profile trigger: `../../supabase/migrations/20260331_003_auth_teacher_student.sql`
- Narrative Edge Function: `../../supabase/functions/narrative-engine/index.ts`

## Quality checks

```bash
npm run lint
npm run build
```

### Pre-deploy smoke (manual)

After attendance performance work, spot-check: rapid attendance marking (no reverts); draft-only saves vs home/missed banners (expect refresh after **Finalize**); student profile attendance history around date boundaries; `/api/cron/monthly-billing` returns 401/503 without a valid bearer in production.
