import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendTutorSetupLink } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { data: tutor } = await getDb()
    .from('tutors')
    .select('id, name, email, password_hash, archived_at')
    .eq('id', params.id)
    .single();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
  if (tutor.archived_at !== null) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }
  if (tutor.password_hash) return NextResponse.json({ error: 'Tutor has already completed portal setup' }, { status: 409 });

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await getDb().from('tutors').update({
    setup_token: token,
    setup_token_expires_at: expiresAt,
  }).eq('id', tutor.id);

  if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error('NEXT_PUBLIC_APP_URL is not set');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  try {
    const result = await sendTutorSetupLink({ tutorName: tutor.name, tutorEmail: tutor.email, token, appUrl });
    if (result.error) {
      console.error('[resend-setup] Resend rejected:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[resend-setup] threw:', err);
    return NextResponse.json({ error: err.message ?? 'Failed to send email' }, { status: 500 });
  }
}
