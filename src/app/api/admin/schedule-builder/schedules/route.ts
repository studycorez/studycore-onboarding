import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const VALID_DURATIONS = new Set([15, 30, 45, 60, 75, 90, 120]);

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));

  const {
    tutor_id, student_id, day_of_week, time_local,
    timezone, duration_minutes, recurring_started_on, notes,
  } = body;

  // ── Validation ─────────────────────────────────────────────────────────
  if (!tutor_id) return NextResponse.json({ error: 'tutor_id is required' }, { status: 400 });
  if (!student_id) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  if (day_of_week == null || typeof day_of_week !== 'number' || day_of_week < 0 || day_of_week > 6) {
    return NextResponse.json({ error: 'day_of_week is required (0=Sun, 6=Sat)' }, { status: 400 });
  }
  if (!time_local || typeof time_local !== 'string') {
    return NextResponse.json({ error: 'time_local is required (HH:MM format)' }, { status: 400 });
  }
  if (!timezone || typeof timezone !== 'string') {
    return NextResponse.json({ error: 'timezone is required (e.g. America/Los_Angeles)' }, { status: 400 });
  }
  if (!duration_minutes || !VALID_DURATIONS.has(duration_minutes)) {
    return NextResponse.json({ error: 'duration_minutes must be one of: 15, 30, 45, 60, 75, 90, 120' }, { status: 400 });
  }
  if (!recurring_started_on || typeof recurring_started_on !== 'string') {
    return NextResponse.json({ error: 'recurring_started_on is required (YYYY-MM-DD)' }, { status: 400 });
  }

  // ── Verify tutor exists and is active ──────────────────────────────────
  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, active')
    .eq('id', tutor_id)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
  if (!tutor.active) return NextResponse.json({ error: 'Tutor is inactive' }, { status: 404 });

  // ── Verify student exists ──────────────────────────────────────────────
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', student_id)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  // ── Verify signed contract exists for this pair ────────────────────────
  const { data: contract } = await supabase
    .from('contracts')
    .select('id')
    .eq('tutor_id', tutor_id)
    .eq('student_id', student_id)
    .eq('status', 'signed')
    .maybeSingle();

  if (!contract) {
    return NextResponse.json({
      error: 'No signed contract exists for this tutor-student pair. Use add-student endpoint first to create one.',
    }, { status: 400 });
  }

  // ── Upsert schedule row ────────────────────────────────────────────────
  const { data: row, error: upsertErr } = await supabase
    .from('tutor_reported_schedules')
    .upsert({
      tutor_id,
      student_id,
      day_of_week,
      time_local,
      timezone,
      duration_minutes,
      recurring_started_on,
      notes: notes?.trim() || null,
      reported_at: new Date().toISOString(),
      reported_by_admin_id: user.id,
    }, {
      onConflict: 'tutor_id,student_id,day_of_week,time_local,recurring_started_on',
    })
    .select('*')
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json(row, { status: 201 });
}
