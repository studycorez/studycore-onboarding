# StudyCore Scheduler — CLAUDE.md

## What this is
SAT tutoring platform. Next.js 14 + Supabase + Vercel. ~180 students, ~35 tutors, 3 founders (Harshil, Tanuj, Neil).

## Hard rules
- **Never push to main without explicit approval.** GitHub auto-deploys main to production.
- **Never touch production Supabase directly.** No direct SQL, no migrations, no RLS changes without approval.
- **Checkpoint before any commit, push, or deploy.** Show the diff and wait for a yes.
- **Never commit .env files or credentials.** `.env.local` is gitignored — keep it that way.
- **.env.vercel-prod is checked in — do not add secrets to it.**

## Stack
- **Framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database:** Supabase (project ID: egulthvtlfywawalcjtq)
- **Auth:** Supabase Auth (admin, student email+password, parent magic link, tutor JWT)
- **Deployment:** Vercel (auto-deploy from main), custom domain: app.studycore.net
- **Email:** Resend (noreply@studycore.net)
- **SMS:** GHL (location ID: 67091iYHBXVeSyRGbCoq)
- **Video:** Zoom Server-to-Server OAuth
- **Payments:** Stripe
- **AI:** Anthropic Claude API
- **Repo:** harshilch611-source/studycore-scheduler

## Project structure
```
src/
  app/          # App Router pages
    admin/      # Admin dashboard
    api/        # API routes
    login/      # Auth
    parent-portal/
    student-portal/
    tutor-portal/
    tutor-form/ # Tutor hiring application
    nps/        # NPS surveys
    sessions/   # Session management
  components/   # Shared components
  hooks/        # Custom React hooks
  lib/          # Utilities, Supabase client, helpers
  types/        # TypeScript type definitions
  middleware.ts # Auth middleware
scripts/        # One-off and recurring scripts (tsx)
supabase/       # Supabase config/migrations
```

## Dev commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run seed` — seed database
- Scripts run via `tsx scripts/<name>.ts`

## Known security debt
- `/api/admin/*` routes only check Supabase login, not admin role — do not add new admin endpoints without fixing this first

## Test account
- Student "Harshil Test" — harshilch611@gmail.com / StudyCore2024!

## Context
For business context, priorities, and task list, see the vault at `~/Documents/claudesecondbrain/` (StudyCore-Context.md, Priorities.md, Tasks.md).
