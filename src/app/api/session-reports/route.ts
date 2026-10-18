import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PAYROLL_CUTOFF, BACKLOG_WINDOW_END } from '@/lib/payroll-eligibility';
import { triggerCheckIns } from '@/lib/check-in-triggers';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = makeSupabase();
    const body = await req.json();

    const {
      session_id,
      student_attended,
      tutor_attended,
      duration_minutes,
      topics_covered,
      engagement_rating,
      homework_assigned,
      homework_time_estimate_minutes,
      concerns_for_parent,
      target_score_range,
      extra_practice_areas,
      private_tutor_notes,
      requires_admin_approval,
      override_student_name,
      override_student_id,
      homework_items,
      practice_test_completed,
      practice_test_type,
      practice_test_score,
    } = body;

    // Basic validation
    if (!session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    if (!['yes', 'no', 'late'].includes(student_attended)) {
      return NextResponse.json({ error: 'student_attended must be yes, no, or late' }, { status: 400 });
    }
    if (!['yes', 'partial', 'no_show'].includes(tutor_attended)) {
      return NextResponse.json({ error: 'tutor_attended must be yes, partial, or no_show' }, { status: 400 });
    }
    if (!duration_minutes || duration_minutes <= 0) {
      return NextResponse.json({ error: 'duration_minutes must be > 0' }, { status: 400 });
    }
    if (!topics_covered || topics_covered.length < 10) {
      return NextResponse.json({ error: 'topics_covered must be at least 10 characters' }, { status: 400 });
    }
    if (!engagement_rating || engagement_rating < 1 || engagement_rating > 5) {
      return NextResponse.json({ error: 'engagement_rating must be between 1 and 5' }, { status: 400 });
    }
    if (!homework_assigned) {
      return NextResponse.json({ error: 'homework_assigned required' }, { status: 400 });
    }

    // Fetch session to get tutor_id and student_id
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, tutor_id, student_id, scheduled_at, late_filing_approved_at')
      .eq('id', session_id)
      .maybeSingle();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // ── Filing window check ────────────────────────────────────────────────
    const scheduledMs = new Date((session as any).scheduled_at as string).getTime();
    const hoursSinceScheduled = (Date.now() - scheduledMs) / (1000 * 60 * 60);

    const payrollCutoffMs  = new Date(PAYROLL_CUTOFF).getTime();
    const backlogWindowEndMs = new Date(BACKLOG_WINDOW_END).getTime();

    // Backlog window: sessions on/after PAYROLL_CUTOFF (2026-05-15) may be
    // filed without the 72hr rule until BACKLOG_WINDOW_END (2026-06-01).
    // This is a one-time grace period for the cutoff transition; it auto-
    // expires after BACKLOG_WINDOW_END with no code change needed.
    const isInBacklogWindow =
      scheduledMs >= payrollCutoffMs && Date.now() < backlogWindowEndMs;

    if (isInBacklogWindow) {
      // Allowed — stamp the session so audit trail shows it was backlog-filed
      await supabase
        .from('sessions')
        .update({ report_backlogged: true })
        .eq('id', session_id);
      // Fall through to report insert
    } else {
      // Standard gate: 72hr rule + admin late-filing approval
      const lateFilingApproved = !!(session as any).late_filing_approved_at;
      if (hoursSinceScheduled > 72 && !lateFilingApproved) {
        return NextResponse.json(
          { error: 'Past 72-hour filing window. Request admin override.' },
          { status: 423 },
        );
      }
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('session_reports')
      .select('id')
      .eq('session_id', session_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'A report for this session already exists.' }, { status: 409 });
    }

    // Determine effective student_id
    const effectiveStudentId = override_student_id || session.student_id;

    // Insert report
    const { data: report, error: insertErr } = await supabase
      .from('session_reports')
      .insert({
        session_id,
        tutor_id: session.tutor_id,
        submitted_at: new Date().toISOString(),
        student_attended,
        tutor_attended,
        duration_minutes,
        topics_covered,
        engagement_rating,
        homework_assigned,
        homework_time_estimate_minutes: homework_time_estimate_minutes ?? null,
        concerns_for_parent: concerns_for_parent ?? null,
        target_score_range: target_score_range ?? null,
        extra_practice_areas: extra_practice_areas ?? null,
        private_tutor_notes: private_tutor_notes ?? null,
        requires_admin_approval: requires_admin_approval ?? false,
        override_student_name: override_student_name ?? null,
        student_id: effectiveStudentId ?? null,
        practice_test_completed: practice_test_completed ?? false,
        practice_test_type: practice_test_completed ? (practice_test_type ?? null) : null,
        practice_test_score: practice_test_completed ? (practice_test_score ?? null) : null,
      })
      .select('id')
      .single();

    if (insertErr || !report) {
      console.error('[session-reports] insert error:', insertErr);
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
    }

    // Insert homework items if provided and student is known
    if (Array.isArray(homework_items) && homework_items.length > 0 && effectiveStudentId) {
      const rows = homework_items
        .filter((item: any) => item.description?.trim())
        .map((item: any) => ({
          session_report_id: report.id,
          student_id: effectiveStudentId,
          description: item.description.trim(),
          estimated_minutes: item.estimated_minutes ?? null,
        }));
      if (rows.length > 0) {
        const { error: hwErr } = await supabase.from('homework_items').insert(rows);
        if (hwErr) {
          console.error('[session-reports] homework_items insert error:', hwErr);
          // Delete the report we just inserted to keep things consistent —
          // homework_items is required for student/parent visibility + XP
          await supabase.from('session_reports').delete().eq('id', report.id);
          return NextResponse.json(
            { error: 'Failed to save homework items. Report not submitted. Please try again.' },
            { status: 500 },
          );
        }
      }
    }

    // Mark session report_submitted flag (best-effort)
    await supabase
      .from('sessions')
      .update({ report_submitted: true, report_submitted_at: new Date().toISOString() })
      .eq('id', session_id);

    // Auto-record practice test score in student_progress so the chart populates
    if (practice_test_completed && practice_test_score && effectiveStudentId) {
      const entry: Record<string, unknown> = {
        student_id:  effectiveStudentId,
        session_id:  session_id,
        recorded_at: new Date().toISOString(),
        notes: `${practice_test_type === 'full' ? 'Full SAT' : practice_test_type === 'math' ? 'Math Section' : 'R&W Section'} — from session report`,
      };
      if (practice_test_type === 'full')  entry.total_score   = practice_test_score;
      if (practice_test_type === 'math')  entry.math_score    = practice_test_score;
      if (practice_test_type === 'rw')    entry.reading_score = practice_test_score;
      await supabase.from('student_progress').insert(entry).catch(() => {});
    }

    // Trigger check-ins non-blocking
    triggerCheckIns({
      sessionId: session_id,
      reportId: report.id,
      studentId: effectiveStudentId ?? null,
      tutorId: session.tutor_id,
      practiceTestCompleted: practice_test_completed ?? false,
      practiceTestType: practice_test_type ?? null,
      practiceTestScore: practice_test_score ?? null,
      topicsCovered: topics_covered,
      engagementRating: engagement_rating,
      concernsForParent: concerns_for_parent ?? null,
    }).catch(err => console.error('[check-in-triggers]', err?.message));

    return NextResponse.json({ ok: true, id: report.id });
  } catch (err: any) {
    console.error('[session-reports] unhandled error:', err.message, err.stack);
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 });
  }
}
