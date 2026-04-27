import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end   = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id, tutor_id, student_id, scheduled_at, duration_minutes,
      status, payment_status, zoom_join_url, zoom_host_url,
      reschedule_count, reschedule_reason, rescheduled_from,
      cancellation_reason, session_notes,
      tutor:tutors(id, name),
      student:students(id, name)
    `)
    .gte('scheduled_at', start)
    .lte('scheduled_at', end)
    .order('scheduled_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
