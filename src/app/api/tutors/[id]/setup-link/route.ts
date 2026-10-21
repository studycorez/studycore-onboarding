import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { data: tutor } = await getDb()
    .from('tutors')
    .select('id, setup_token, setup_token_expires_at, archived_at')
    .eq('id', params.id)
    .single();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
  if (tutor.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  let token = tutor.setup_token;
  const expired = !tutor.setup_token_expires_at || new Date(tutor.setup_token_expires_at) < new Date();

  if (!token || expired) {
    token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await getDb().from('tutors').update({
      setup_token: token,
      setup_token_expires_at: expiresAt,
    }).eq('id', params.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';
  return NextResponse.json({ url: `${appUrl}/tutor-portal/setup?token=${token}` });
}
