# Domain Setup

All links in emails and portal URLs are driven by a single environment variable.

## Required Environment Variable

```
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

Set this in:
- **Vercel dashboard** → Project → Settings → Environment Variables (all environments)
- **Local dev** → `.env.local` (e.g. `NEXT_PUBLIC_APP_URL=http://localhost:3000`)

Without this variable, links fall back to `http://localhost:3000`, which will produce broken links in production emails.

## Where It's Used

| File | Purpose |
|------|---------|
| `src/app/api/tutors/[id]/send-setup/route.ts` | Tutor portal setup link in email |
| `src/app/api/tutors/send-setup-all/route.ts` | Bulk tutor setup link |
| `src/app/api/student-portal/send-setup/route.ts` | Student portal setup link |
| `src/app/api/parent-portal/auth/route.ts` | Parent magic-link login |
| `src/app/api/parent-portal/send-onboarding/route.ts` | Parent onboarding email |
| `src/app/api/contracts/route.ts` | Contract signing link |
| `src/app/api/contracts/[contract_id]/remind/route.ts` | Contract reminder link |
| `src/app/api/cron/reminders/route.ts` | Session reminder links |
| `src/app/api/cron/payroll-summary/route.ts` | Payroll summary email links |
| `src/app/api/cron/zoom-sync/route.ts` | Zoom sync callback |
| `src/app/api/webhooks/slack-notify/route.ts` | Slack notification links |
| `src/app/admin/send-forms/page.tsx` | Admin form share URL display |

## Custom Domain on Vercel

1. Go to **Vercel → Project → Domains**
2. Add your custom domain (e.g. `app.yourdomain.com`)
3. Follow DNS instructions from Vercel
4. Update `NEXT_PUBLIC_APP_URL` to match the custom domain
5. Redeploy (or trigger a new deployment) for the env var to take effect
