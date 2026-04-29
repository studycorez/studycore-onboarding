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

export async function GET(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  const { day_of_week, start_time, end_time } = await req.json();
  const { data, error } = await supabase
    .from('tutor_availability')
    .insert({ tutor_id: payload.tutorId, day_of_week, start_time, end_time, is_active: true })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const payload = await auth(req);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  // Verify ownership before deleting
  const { data: slot } = await supabase.from('tutor_availability').select('tutor_id').eq('id', id).single();
  if (!slot || slot.tutor_id !== payload.tutorId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await supabase.from('tutor_availability').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}
