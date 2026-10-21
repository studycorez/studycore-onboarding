import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendLowHoursAlert, sendRescheduleRequest } from '@/lib/email';
import { applySessionHoursForStudent } from '@/lib/apply-session-hours';
import { computeTutorLoggedHours } from '@/lib/hours-policy';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id, actual_duration_minutes, went_well, issues, follow_up_needed,
            math_score, reading_score, writing_score, confidence_level,
            reschedule_requested, reschedule_reason, reschedule_preferred_time } = body;
    if (!session_id || !actual_duration_minutes) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const { data: session, error: sessionError } = await getDb().from('sessions').select('*, tutor:tutors(*), student:students(*)').eq('id', session_id).single();
    if (sessionError || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const { data: existing } = await getDb().from('session_logs').select('id').eq('session_id', session_id).single();
    if (existing) return NextResponse.json({ error: 'Log already submitted for this session' }, { status: 409 });

    const { error: insertError } = await getDb().from('session_logs').insert({
      session_id,
      tutor_id: session.tutor_id,
      actual_duration_minutes,
      went_well: went_well || null,
      issues: issues || null,
      follow_up_needed: follow_up_needed || false,
      math_score:       math_score    ?? null,
      reading_score:    reading_score ?? null,
      writing_score:    writing_score ?? null,
      confidence_level: confidence_level ?? null,
    });
    if (insertError) throw insertError;

    const sessionUpdates: Record<string, unknown> = {
      status: 'completed',
      session_notes: went_well || null,
      tutor_feedback: issues || null,
    };
    if (reschedule_requested) sessionUpdates.reschedule_requested = true;
    await getDb().from('sessions').update(sessionUpdates).eq('id', session_id);

    // Notify admin if tutor requested a reschedule
    if (reschedule_requested) {
      const tutor   = session.tutor   as any;
      const student = session.student as any;
      sendRescheduleRequest({
        tutorName:           tutor?.name    ?? 'Unknown Tutor',
        studentName:         student?.name  ?? 'Unknown Student',
        sessionId:           session_id,
        reason:              reschedule_reason ?? 'Unspecified',
        preferredTime:       reschedule_preferred_time ?? null,
      }).catch(err => console.error('sendRescheduleRequest failed:', err));
    }

    // ── Save student progress entry if any scores provided ────────────────────
    if (math_score || reading_score || writing_score) {
      const total = (math_score ?? 0) + (reading_score ?? 0) + (writing_score ?? 0) || null;
      getDb().from('student_progress').insert({
        student_id:    session.student_id,
        session_id,
        math_score:    math_score    ?? null,
        reading_score: reading_score ?? null,
        writing_score: writing_score ?? null,
        total_score:   total,
      }).then(({ error }) => { if (error) console.error('student_progress insert error:', error); });
    }

    // ── Hours tracking ────────────────────────────────────────────────────────
    // Use tutor's reported duration to attribute hours via new policy.
    const student = session.student as any;
    const policyHours = computeTutorLoggedHours(actual_duration_minutes ?? 0);

    const hoursResult = await applySessionHoursForStudent(getDb(), {
      sessionId: session_id,
      studentId: session.student_id,
      newHoursAttributed: policyHours,
      newHoursSource: 'tutor_logged',
      finalize: true,
      context: {
        source: 'tutor_log',
        actor: `tutor:${session.tutor_id}`,
        reason: 'Tutor session report submitted',
      },
    });

    const currentUsedHours = hoursResult.success ? hoursResult.after : (student.used_hours ?? 0);
    const purchased = student.purchased_hours ?? 0;
    const remaining = purchased - currentUsedHours;

    // Auto-complete student when hours are exhausted
    if (remaining <= 0 && student.status === 'active') {
      await getDb()
        .from('students')
        .update({ status: 'completed' })
        .eq('id', session.student_id);
    }

    if (remaining < 5 && !student.low_hours_alerted && purchased > 0) {
      await getDb()
        .from('students')
        .update({ low_hours_alerted: true })
        .eq('id', session.student_id);

      // Non-blocking — don't let email failure fail the request
      sendLowHoursAlert({
        studentName:    student.name,
        remainingHours: remaining,
        parentName:     student.parent_name,
        parentEmail:    student.parent_email,
        studentEmail:   student.email,
      }).catch(err => console.error('Low hours alert failed:', err));
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('session-log error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const session_id = searchParams.get('session_id');
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  const { data } = await getDb().from('session_logs').select('*').eq('session_id', session_id).single();
  return NextResponse.json({ log: data || null });
}
