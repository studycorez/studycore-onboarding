import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { PAYROLL_CUTOFF, BACKLOG_WINDOW_END } from '@/lib/payroll-eligibility';

export const dynamic = 'force-dynamic';

// Placeholder student row that holds the FK while the session awaits admin
// approval. The real student_id is written at approval time.
const UNMATCHED_STUDENT_ID = '23afaea2-9e1f-4601-8b5f-f763b1e84330';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    logged_student_name,
    scheduled_at,
    duration_minutes,
    topics_covered,
    homework_assigned,
    engagement_rating,
    tutor_attended,
    private_tutor_notes,
  } = body;

  // ── Validation ────────────────────────────────────────────────────────────
  const studentName = (logged_student_name ?? '').trim();
  if (studentName.length < 2)
    return NextResponse.json({ error: 'Student name must be at least 2 characters' }, { status: 400 });
  if (!scheduled_at)
    return NextResponse.json({ error: 'scheduled_at required' }, { status: 400 });
  if (!duration_minutes || duration_minutes <= 0)
    return NextResponse.json({ error: 'duration_minutes must be > 0' }, { status: 400 });
  if (!topics_covered || topics_covered.length < 10)
    return NextResponse.json({ error: 'topics_covered must be at least 10 characters' }, { status: 400 });
  if (!homework_assigned)
    return NextResponse.json({ error: 'homework_assigned required' }, { status: 400 });
  if (!engagement_rating || engagement_rating < 1 || engagement_rating > 5)
    return NextResponse.json({ error: 'engagement_rating must be 1–5' }, { status: 400 });
  if (!['yes', 'partial', 'no_show'].includes(tutor_attended))
    return NextResponse.json({ error: 'tutor_attended must be yes, partial, or no_show' }, { status: 400 });

  const scheduledMs        = new Date(scheduled_at).getTime();
  const payrollCutoffMs    = new Date(PAYROLL_CUTOFF).getTime();
  const backlogWindowEndMs = new Date(BACKLOG_WINDOW_END).getTime();
  const now                = Date.now();

  if (isNaN(scheduledMs))
    return NextResponse.json({ error: 'scheduled_at is not a valid date' }, { status: 400 });
  if (scheduledMs < payrollCutoffMs)
    return NextResponse.json({ error: 'Session must be on or after May 15, 2026 (payroll cutoff).' }, { status: 422 });
  if (scheduledMs >= now)
    return NextResponse.json({ error: 'Session must be in the past.' }, { status: 422 });
  if (now >= backlogWindowEndMs)
    return NextResponse.json({ error: 'The backlog filing window has closed (June 1, 2026). Contact admin.' }, { status: 422 });

  const supabase = makeSupabase();

  // ── Insert session (placeholder student until admin approves) ─────────────
  const { data: session, error: sessionInsertErr } = await supabase
    .from('sessions')
    .insert({
      tutor_id:             payload.tutorId,
      student_id:           UNMATCHED_STUDENT_ID,
      logged_student_name:  studentName,
      scheduled_at,
      duration_minutes,
      status:               'pending_approval',
      created_by_tutor:     true,
      paid_in_run_id:       null,
    })
    .select('id')
    .single();

  if (sessionInsertErr || !session)
    return NextResponse.json({ error: sessionInsertErr?.message ?? 'Failed to create session' }, { status: 500 });

  // ── Insert session_report ─────────────────────────────────────────────────
  const { error: reportInsertErr } = await supabase
    .from('session_reports')
    .insert({
      session_id:          session.id,
      tutor_id:            payload.tutorId,
      submitted_at:        new Date().toISOString(),
      student_attended:    tutor_attended === 'no_show' ? 'no' : 'yes',
      tutor_attended,
      duration_minutes,
      topics_covered,
      homework_assigned,
      engagement_rating,
      private_tutor_notes: private_tutor_notes ?? null,
      report_backlogged:   true,
    });

  if (reportInsertErr) {
    // Roll back the session to avoid an orphan
    await supabase.from('sessions').delete().eq('id', session.id);
    console.error('[log-missed-session] report insert failed:', reportInsertErr.message);
    return NextResponse.json({ error: 'Failed to save session report. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ session_id: session.id });
}
