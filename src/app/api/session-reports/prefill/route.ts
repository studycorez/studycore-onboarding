import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  // Verify tutor JWT
  const tutorToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!tutorToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(tutorToken);
  if (!payload) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const supabase = makeSupabase();

  const { data: session, error } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, scheduled_at, duration_minutes, status, tutor:tutors(id, name), student:students(id, name)')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Verify tutor owns this session
  if (session.tutor_id !== payload.tutorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch existing report (full data for edit pre-fill)
  const { data: existing } = await supabase
    .from('session_reports')
    .select('id, submitted_at, edit_unlocked_until, student_attended, tutor_attended, duration_minutes, topics_covered, engagement_rating, homework_assigned, homework_time_estimate_minutes, concerns_for_parent, target_score_range, extra_practice_areas, private_tutor_notes')
    .eq('session_id', sessionId)
    .maybeSingle();

  const tutor   = (session as any).tutor   as { id: string; name: string } | null;
  const student = (session as any).student as { id: string; name: string } | null;

  const scheduledMs = new Date(session.scheduled_at).getTime();
  const isLateFiling = Date.now() - scheduledMs > 24 * 60 * 60 * 1000;

  // Determine edit eligibility when a report exists
  const submittedMs   = existing?.submitted_at ? new Date(existing.submitted_at).getTime() : 0;
  const isAutoEditable   = existing ? (Date.now() - submittedMs) / (1000 * 60) <= 60 : false;
  const isAdminUnlocked  = existing?.edit_unlocked_until
    ? new Date(existing.edit_unlocked_until).getTime() > Date.now()
    : false;

  // Fetch homework items for edit pre-fill
  let existingHomeworkItems: any[] = [];
  if (existing) {
    const { data: hwItems } = await supabase
      .from('homework_items')
      .select('description, estimated_minutes')
      .eq('session_report_id', existing.id);
    existingHomeworkItems = hwItems ?? [];
  }

  return NextResponse.json({
    session_id:        session.id,
    tutor_id:          session.tutor_id,
    tutor_name:        tutor?.name ?? '—',
    student_id:        student?.id ?? null,
    student_name:      student?.name ?? null,
    scheduled_at:      session.scheduled_at,
    duration_minutes:  session.duration_minutes,
    status:            session.status,
    already_submitted: !!existing,
    is_late_filing:    isLateFiling,
    is_auto_editable:  isAutoEditable,
    is_admin_unlocked: isAdminUnlocked,
    existing_report:   existing ? {
      ...existing,
      homework_items: existingHomeworkItems,
    } : null,
  });
}
