import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { exchangeGoogleCode } from '@/lib/google-calendar';
import { verifyTutorJWT } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get('code');
  const state = searchParams.get('state'); // JWT passed as state

  if (!code || !state) {
    return NextResponse.redirect(new URL('/tutor-portal/profile?error=google', req.url));
  }

  const payload = await verifyTutorJWT(state);
  if (!payload) {
    return NextResponse.redirect(new URL('/tutor-portal/profile?error=google', req.url));
  }

  const { data: tutorCheck } = await getDb()
    .from('tutors')
    .select('archived_at')
    .eq('id', payload.tutorId)
    .single();
  if (tutorCheck?.archived_at !== null && tutorCheck?.archived_at !== undefined) {
    return NextResponse.redirect(new URL('/tutor-portal/login?error=archived', req.url));
  }

  try {
    const tokens = await exchangeGoogleCode(code);

    await getDb().from('tutors').update({
      google_access_token:     tokens.access_token ?? null,
      google_refresh_token:    tokens.refresh_token ?? null,
      google_token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      google_calendar_connected: true,
    }).eq('id', payload.tutorId);

    return NextResponse.redirect(new URL('/tutor-portal/profile?connected=true', req.url));
  } catch (err) {
    console.error('Google callback error:', err);
    return NextResponse.redirect(new URL('/tutor-portal/profile?error=google', req.url));
  }
}
