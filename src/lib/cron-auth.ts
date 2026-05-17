import { NextRequest, NextResponse } from 'next/server';

/**
 * Verify a request is from Vercel cron by checking the Authorization
 * header against CRON_SECRET. Returns null if valid, or a 401 response
 * if invalid.
 *
 * Vercel automatically attaches 'Authorization: Bearer <CRON_SECRET>'
 * to every cron trigger when CRON_SECRET is set as an env var.
 */
export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron-auth] CRON_SECRET is not set in environment');
    return NextResponse.json(
      { error: 'Cron not configured' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    console.error('[cron-auth] Invalid or missing authorization');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }
  return null;
}
