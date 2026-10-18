import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { applySessionHoursForStudent } from '@/lib/apply-session-hours';
import { computeTutorLoggedHours } from '@/lib/hours-policy';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { session_id: string } },
) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const payload = await verifyTutorJWT(token);
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const authTutorId = payload.tutorId;

    const supabase = makeSupabase();
    const sessionId = params.session_id;
    const body = await req.json();

    // Only destructure the fields tutors are allowed to edit.
    // Protected fields (override_student_name, requires_admin_approval,
    // admin_approved_*, edit_*, submitted_at, tutor_id, session_id, id)
    // are never read from the request body.
    const {
      student_attended, tutor_attended, duration_minutes,
      topics_covered, engagement_rating, homework_assigned,
      homework_time_estimate_minutes, concerns_for_parent,
      target_score_range, extra_practice_areas, private_tutor_notes,
      homework_items,
      practice_test_completed, practice_test_type, practice_test_score,
    } = body;

    // ── Fetch existing report ────────────────────────────────────────────────
    const { data: report } = await supabase
      .from('session_reports')
      .select('id, tutor_id, submitted_at, edit_unlocked_until')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (!report) {
      return NextResponse.json({ error: 'No report found to update' }, { status: 404 });
    }

    // ── Ownership check ──────────────────────────────────────────────────────
    if (report.tutor_id !== authTutorId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Edit window enforcement ──────────────────────────────────────────────
    // Tutor may edit within 60 min of submission (auto window)
    // OR when an admin has explicitly unlocked the report.
    const submittedMs   = report.submitted_at ? new Date(report.submitted_at).getTime() : 0;
    const autoEditable  = (Date.now() - submittedMs) / (1000 * 60) <= 60;
    const adminUnlocked = report.edit_unlocked_until
      && new Date(report.edit_unlocked_until).getTime() > Date.now();

    if (!autoEditable && !adminUnlocked) {
      return NextResponse.json({ error: 'Edit window has expired.' }, { status: 403 });
    }

    // Fetch existing duration to detect change for hours adjustment
    const { data: existingReport } = await supabase
      .from('session_reports')
      .select('duration_minutes')
      .eq('id', report.id)
      .single();

    const oldDuration = existingReport?.duration_minutes ?? null;

    // ── Update the report row (only editable fields) ─────────────────────────
    const { error: updateErr } = await supabase
      .from('session_reports')
      .update({
        student_attended,
        tutor_attended,
        duration_minutes,
        topics_covered,
        engagement_rating,
        homework_assigned,
        homework_time_estimate_minutes: homework_time_estimate_minutes ?? null,
        concerns_for_parent:  concerns_for_parent  ?? null,
        target_score_range:   target_score_range   ?? null,
        extra_practice_areas: extra_practice_areas ?? null,
        private_tutor_notes:  private_tutor_notes  ?? null,
        practice_test_completed: practice_test_completed ?? false,
        practice_test_type: practice_test_completed ? (practice_test_type ?? null) : null,
        practice_test_score: practice_test_completed ? (practice_test_score ?? null) : null,
      })
      .eq('id', report.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // ── Hours adjustment if duration changed ─────────────────────────────────
    // If the tutor edited duration_minutes, recompute hours_attributed using
    // the new value and apply the delta to the student's used_hours.
    if (typeof duration_minutes === 'number' && duration_minutes !== oldDuration) {
      const { data: session } = await supabase
        .from('sessions')
        .select('student_id')
        .eq('id', sessionId)
        .maybeSingle();

      if (session?.student_id) {
        const newPolicyHours = computeTutorLoggedHours(duration_minutes);
        const hoursResult = await applySessionHoursForStudent(supabase, {
          sessionId,
          studentId: session.student_id,
          newHoursAttributed: newPolicyHours,
          newHoursSource: 'tutor_logged',
          finalize: true,
          context: {
            source: 'tutor_log',
            actor: `tutor:${authTutorId}`,
            reason: `Report edit: duration changed from ${oldDuration} to ${duration_minutes}`,
          },
        });

        if (!hoursResult.success) {
          console.error(
            `[session-reports PATCH] Hours adjustment failed for session ${sessionId}: ${hoursResult.error ?? 'unknown'}`
          );
        }
      }
    }

    // ── Replace homework_items ───────────────────────────────────────────────
    if (Array.isArray(homework_items)) {
      await supabase.from('homework_items').delete().eq('session_report_id', report.id);

      const { data: session } = await supabase
        .from('sessions')
        .select('student_id')
        .eq('id', sessionId)
        .maybeSingle();

      const studentId = session?.student_id;
      if (studentId && homework_items.length > 0) {
        const rows = homework_items
          .filter((item: any) => item.description?.trim())
          .map((item: any) => ({
            session_report_id: report.id,
            student_id:        studentId,
            description:       item.description.trim(),
            estimated_minutes: item.estimated_minutes ?? null,
          }));
        if (rows.length > 0) {
          await supabase.from('homework_items').insert(rows);
        }
      }
    }

    return NextResponse.json({ ok: true, id: report.id });
  } catch (err: any) {
    console.error('[session-reports PATCH] error:', err.message);
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 });
  }
}
