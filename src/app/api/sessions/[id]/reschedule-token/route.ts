import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { data: session } = await getDb()
    .from('sessions')
    .select('id, status, scheduled_at')
    .eq('id', params.id)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (session.status !== 'scheduled') {
    return NextResponse.json({ error: 'Only scheduled sessions can be rescheduled' }, { status: 400 });
  }

  const token   = randomBytes(20).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  await getDb().from('sessions').update({
    reschedule_token:            token,
    reschedule_token_expires_at: expires,
  }).eq('id', params.id);

  return NextResponse.json({ token, url: `${APP_URL}/reschedule/${token}` });
}
