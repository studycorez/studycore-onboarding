import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendTutorSetupLink } from '@/lib/email';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, name, email')
    .eq('id', params.id)
    .single();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await supabase.from('tutors').update({
    setup_token: token,
    setup_token_expires_at: expiresAt,
  }).eq('id', tutor.id);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://studycore-eight.vercel.app';
  await sendTutorSetupLink({ tutorName: tutor.name, tutorEmail: tutor.email, token, appUrl });

  return NextResponse.json({ ok: true });
}
