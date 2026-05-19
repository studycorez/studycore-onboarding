import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function auth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? verifyTutorJWT(token) : null;
}

async function checkNotArchived(tutorId: string): Promise<boolean> {
  const { data } = await supabase.from('tutors').select('archived_at').eq('id', tutorId).single();
  return data?.archived_at === null || data?.archived_at === undefined;
}

export async function GET(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await checkNotArchived(payload.tutorId)) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('tutor_availability')
    .select('*')
    .eq('tutor_id', payload.tutorId)
    .order('day_of_week')
    .order('start_time');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await checkNotArchived(payload.tutorId)) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const { day_of_week, start_time, end_time } = await req.json();
  const { data, error } = await supabase
    .from('tutor_availability')
    .insert({ tutor_id: payload.tutorId, day_of_week, start_time, end_time, is_active: true })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await checkNotArchived(payload.tutorId)) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const slots: { day: number; start: string; end: string }[] = body.slots ?? [];

  await supabase.from('tutor_availability').delete().eq('tutor_id', payload.tutorId);

  if (slots.length > 0) {
    const { error } = await supabase.from('tutor_availability').insert(
      slots.map(s => ({
        tutor_id:    payload.tutorId,
        day_of_week: s.day,
        start_time:  s.start,
        end_time:    s.end,
        is_active:   true,
      })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await checkNotArchived(payload.tutorId)) {
    return NextResponse.json({ error: 'Account inactive. Contact your administrator.' }, { status: 403 });
  }

  const { id } = await req.json();
  // Verify ownership before deleting
  const { data: slot } = await supabase.from('tutor_availability').select('tutor_id').eq('id', id).single();
  if (!slot || slot.tutor_id !== payload.tutorId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await supabase.from('tutor_availability').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
