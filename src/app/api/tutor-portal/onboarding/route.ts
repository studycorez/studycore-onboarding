import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

const VALID_ITEMS = [
  'profile_complete',
  'availability_set',
  'calendar_connected',
  'training_video_watched',
  'students_reviewed',
] as const;

type ChecklistKey = typeof VALID_ITEMS[number];

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { item } = body;

  if (!VALID_ITEMS.includes(item as ChecklistKey)) {
    return NextResponse.json({ error: `Invalid item. Must be one of: ${VALID_ITEMS.join(', ')}` }, { status: 400 });
  }

  const { data: tutor, error: fetchErr } = await getDb()
    .from('tutors')
    .select('onboarding_checklist')
    .eq('id', payload.tutorId)
    .single();

  if (fetchErr || !tutor) {
    return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
  }

  const updated = {
    ...(tutor.onboarding_checklist ?? {}),
    [item]: new Date().toISOString(),
  };

  const { error: updateErr } = await getDb()
    .from('tutors')
    .update({ onboarding_checklist: updated })
    .eq('id', payload.tutorId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
