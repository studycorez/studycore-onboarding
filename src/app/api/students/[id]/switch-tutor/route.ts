import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendTutorSwitchToOldTutor,
  sendTutorSwitchToNewTutor,
  sendTutorSwitchToParent,
  sendTutorSwitchSummary,
} from '@/lib/email';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const studentId = params.id;
    const { newTutorId, reason, notes } = await req.json();
    if (!newTutorId || !reason) {
      return NextResponse.json({ error: 'newTutorId and reason are required' }, { status: 400 });
    }

    // ── Fetch data ────────────────────────────────────────────────────────────
    const [studentRes, newTutorRes, contractRes] = await Promise.all([
      getDb().from('students').select('name, email, parent_name, parent_email').eq('id', studentId).single(),
      getDb().from('tutors').select('id, name, email, archived_at').eq('id', newTutorId).single(),
      getDb().from('contracts')
        .select('id, tutor_id, tutor:tutors(name, email)')
        .eq('student_id', studentId)
        .neq('status', 'voided')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!studentRes.data) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    if (!newTutorRes.data) return NextResponse.json({ error: 'New tutor not found' }, { status: 404 });
    if ((newTutorRes.data as any).archived_at !== null) {
      return NextResponse.json({ error: 'Cannot switch to an archived tutor' }, { status: 400 });
    }
    if (!contractRes.data) return NextResponse.json({ error: 'No active contract found for this student' }, { status: 400 });

    const student  = studentRes.data;
    const newTutor = newTutorRes.data;
    const contract = contractRes.data;
    const oldTutor = contract.tutor as unknown as { name: string; email: string };
    const oldTutorId = contract.tutor_id;

    if (oldTutorId === newTutorId) {
      return NextResponse.json({ error: 'New tutor must be different from current tutor' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // ── 1. Void old contract ──────────────────────────────────────────────────
    await getDb().from('contracts').update({ status: 'voided' }).eq('id', contract.id);

    // ── 2. Cancel future sessions between old tutor and student ───────────────
    const { data: futureSessions } = await supabase
      .from('sessions')
      .select('id, scheduled_at')
      .eq('tutor_id', oldTutorId)
      .eq('student_id', studentId)
      .eq('status', 'scheduled')
      .gt('scheduled_at', now);

    if (futureSessions && futureSessions.length > 0) {
      const ids = futureSessions.map(s => s.id);
      await supabase
        .from('sessions')
        .update({ status: 'cancelled', cancellation_reason: 'tutor_switch' })
        .in('id', ids);
    }

    const cancelledCount = futureSessions?.length ?? 0;

    // ── 3. Create tutor_switches record ───────────────────────────────────────
    await getDb().from('tutor_switches').insert({
      student_id:   studentId,
      old_tutor_id: oldTutorId,
      new_tutor_id: newTutorId,
      reason,
      notes: notes || null,
      switched_by: 'admin',
    });

    // ── 4. Send notifications (non-blocking) ──────────────────────────────────
    const cancelledForEmail = (futureSessions ?? []).map(s => ({ scheduledAt: s.scheduled_at }));

    Promise.allSettled([
      sendTutorSwitchToOldTutor({
        tutorEmail:        oldTutor.email,
        tutorName:         oldTutor.name,
        studentName:       student.name,
        reason,
        cancelledSessions: cancelledForEmail,
      }),
      sendTutorSwitchToNewTutor({
        tutorEmail:   newTutor.email,
        tutorName:    newTutor.name,
        studentName:  student.name,
        studentEmail: student.email,
        reason,
      }),
      ...(student.parent_email ? [sendTutorSwitchToParent({
        parentEmail:  student.parent_email,
        parentName:   student.parent_name,
        studentName:  student.name,
        oldTutorName: oldTutor.name,
        newTutorName: newTutor.name,
      })] : []),
      sendTutorSwitchSummary({
        studentName:   student.name,
        oldTutorName:  oldTutor.name,
        newTutorName:  newTutor.name,
        reason,
        cancelledCount,
        notes: notes || null,
      }),
    ]).catch(err => console.error('tutor switch email error:', err));

    return NextResponse.json({ ok: true, newTutorId, oldTutorId, cancelledCount });
  } catch (err: any) {
    console.error('switch-tutor error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
