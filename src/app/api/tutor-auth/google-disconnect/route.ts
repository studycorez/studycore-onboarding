import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { COOKIE_NAME, verifyTutorJWT } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyTutorJWT(token) : null;
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: tutor } = await getDb().from('tutors').select('archived_at').eq('id', payload.tutorId).single();
  if (tutor?.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  await getDb().from('tutors').update({
    google_access_token:      null,
    google_refresh_token:     null,
    google_token_expires_at:  null,
    google_calendar_connected: false,
  }).eq('id', payload.tutorId);

  return NextResponse.json({ ok: true });
}
