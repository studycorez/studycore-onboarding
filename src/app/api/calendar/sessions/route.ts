import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start');
  const end   = searchParams.get('end');
  const all   = searchParams.get('all') === 'true';

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  console.log(`[calendar/sessions] query: start=${start} end=${end}`);

  const query = supabase
    .from('sessions')
    .select(`
      id, tutor_id, student_id, scheduled_at, duration_minutes,
      status, payment_status, zoom_join_url, zoom_host_url,
      reschedule_count, reschedule_reason, rescheduled_from,
      cancellation_reason, session_notes, fathom_recording_url,
      tutor:tutors(id, name, email),
      student:students(id, name, email, grade, target_score)
    `)
    .gte('scheduled_at', start)
    .lte('scheduled_at', end)
    .order('scheduled_at', { ascending: true })
    .limit(10000);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  console.log(`[calendar/sessions] returned ${data?.length ?? 0} rows`);
  return NextResponse.json(data ?? []);
}
