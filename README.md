# StudyCore — Internal Scheduling & Fulfillment Platform

An internal admin tool for the StudyCore SAT tutoring team to manage tutors, students, sessions, Zoom meetings, and progress tracking.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Database + Auth | Supabase (PostgreSQL) |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Video | Zoom Server-to-Server OAuth |
| Email | Resend |
| Deployment | Vercel |

---

## Getting Started

### 1. Clone and install

```bash
git clone <your-repo>
cd studycore
npm install
```

### 2. Configure environment variables

Copy `.env.local` and fill in your credentials:

```bash
# Already created — just fill in the values:
nano .env.local
```

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → Publishable key (`sb_publishable_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → Secret key (`sb_secret_...`) |
| `ZOOM_ACCOUNT_ID` | Zoom Marketplace → Your Server-to-Server OAuth App → App Credentials |
| `ZOOM_CLIENT_ID` | Same as above |
| `ZOOM_CLIENT_SECRET` | Same as above |
| `RESEND_API_KEY` | resend.com → API Keys |
| `RESEND_FROM_EMAIL` | Your verified sender (e.g. `noreply@studycore.com`) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally, or your Vercel URL in prod |

### 3. Run database migrations

Make sure you have the Supabase CLI installed:
```bash
npm install -g supabase
```

Link to your project:
```bash
supabase link --project-ref egulthvtlfywawalcjtq
```

Push the migration:
```bash
supabase db push
```

Or run the SQL directly in the Supabase Dashboard → SQL Editor → paste contents of `supabase/migrations/001_initial_schema.sql`.

### 4. Seed the database

```bash
npm run seed
```

This creates:
- 1 admin account (`admin@studycore.com` / `StudyCore2024!`)
- 3 tutors with availability
- 5 students
- 10 sessions with progress scores

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with the admin credentials.

---

## Zoom Setup

1. Go to [Zoom Marketplace](https://marketplace.zoom.us)
2. Create a **Server-to-Server OAuth** app
3. Enable these scopes:
   - `meeting:write:meeting:admin`
   - `meeting:read:meeting:admin`
   - `meeting:delete:meeting:admin`
   - `user:read:user:admin`
4. Copy Account ID, Client ID, Client Secret → `.env.local`

Zoom meetings are auto-created on booking. If credentials are not set, meetings are skipped (sessions still book successfully).

---

## Email Setup (Resend)

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your domain
3. Create an API key → `.env.local`
4. Set `RESEND_FROM_EMAIL` to your verified sender address

Emails are sent for:
- Booking confirmation (to student + parent, and tutor)
- 24-hour reminder (via cron)
- 1-hour reminder (via cron)
- Post-session follow-up (triggered when admin marks session complete)

---

## Vercel Deployment

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Manual deploy

```bash
npm install -g vercel
vercel
```

### Environment variables (Vercel Dashboard → Project → Settings → Environment Variables)

Add each of these under **Production** (and optionally Preview/Development):

| Variable | Value / Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → Publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → Secret key — **mark as Secret** |
| `ZOOM_ACCOUNT_ID` | Zoom Marketplace → Your Server-to-Server OAuth App → App Credentials |
| `ZOOM_CLIENT_ID` | Same as above |
| `ZOOM_CLIENT_SECRET` | Same as above — **mark as Secret** |
| `RESEND_API_KEY` | resend.com → API Keys — **mark as Secret** |
| `RESEND_FROM_EMAIL` | Your verified sender address (e.g. `noreply@studycore.com`) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel production URL (e.g. `https://studycore.vercel.app`) |
| `GHL_API_KEY` | GoHighLevel → Settings → API Keys (used by `npm run update-emails` script only — not needed for the app itself) |

> **Note:** `NEXT_PUBLIC_APP_URL` is used to generate tutor availability form links. Set it to your exact Vercel deployment URL — no trailing slash.

The `vercel.json` cron job runs `/api/cron/reminders` hourly — this handles 24h and 1h reminder emails automatically.

---

## Pages

| Route | Description |
|---|---|
| `/dashboard` | Summary stats + upcoming sessions |
| `/tutors` | Tutor grid |
| `/tutors/[id]` | Tutor profile + availability editor + session history |
| `/students` | Student table |
| `/students/[id]` | Student profile + progress chart + session history |
| `/book` | 4-step booking flow |
| `/sessions` | Full session log with filters + inline editing |
| `/admin/send-forms` | Copy individual or bulk availability form links to send to tutors |
| `/availability-form/[tutor_id]` | **Public** — tutors submit their own availability + current sessions |

---

## Architecture Notes

- **Auth:** Supabase email/password, protected by `src/middleware.ts`. The `/availability-form/[tutor_id]` route is public so tutors can submit availability without an account.
- **Database:** Row Level Security (RLS) enabled. All tables require `authenticated` role except `tutor_availability` and `tutors` (public read/write for the availability form).
- **Zoom:** Server-to-Server OAuth — no user login required. Access token fetched fresh on each booking.
- **Emails:** Non-blocking — booking succeeds even if email fails.
- **Cron:** Vercel Cron runs hourly at `:00`. The route finds sessions in the 23–25h window (24h reminder) and 45–75min window (1h reminder) and fires emails only once per session (tracked by `reminder_24h_sent` / `reminder_1h_sent` flags).
