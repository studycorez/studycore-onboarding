import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applySessionHoursForStudent } from '@/lib/apply-session-hours';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const BILLABLE: string[] = ['completed', 'no_show_student'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sessionId = params.id;
  const body = await req.json();
  const newStatus: string | undefined = body.status;

  if (!newStatus) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  // Fetch existing session
  const { data: session, error: fetchErr } = await getDb()
    .from('sessions')
    .select('id, status, student_id, duration_minutes')
    .eq('id', sessionId)
    .single();

  if (fetchErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const oldStatus = session.status as string;

  // Update session status
  const { data: updatedRows, error: updateErr } = await getDb()
    .from('sessions')
    .update({ status: newStatus })
    .eq('id', sessionId)
    .eq('status', oldStatus)
    .select('id');

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({
      error: 'Session status was already changed by another admin. Refresh and try again.'
    }, { status: 409 });
  }

  // Compute hours attribution based on status transition
  const wasBillable = BILLABLE.includes(oldStatus);
  const nowBillable = BILLABLE.includes(newStatus);

  let hoursResult = null;

  if (wasBillable !== nowBillable) {
    // Transitioning into or out of billable — update hours
    const newHoursAttributed = nowBillable ? session.duration_minutes / 60 : 0;

    hoursResult = await applySessionHoursForStudent(getDb(), {
      sessionId,
      studentId: session.student_id,
      newHoursAttributed,
      newHoursSource: 'scheduled',
      finalize: false,
      context: {
        source: 'admin_manual',
        actor: 'admin',
        reason: `Status changed from ${oldStatus} to ${newStatus}`,
      },
    });

    if (!hoursResult.success) {
      console.error(
        `[update-status] HOURS APPLY FAILED. session=${sessionId} ` +
        `student=${session.student_id} old=${oldStatus} new=${newStatus} ` +
        `error=${hoursResult.error ?? 'unknown'}`
      );
      return NextResponse.json({
        error: `Status updated to ${newStatus} but hours apply failed: ${hoursResult.error}. Admin must manually verify used_hours for student ${session.student_id}.`,
        sessionId,
        statusUpdated: true,
        hoursAdjusted: false,
      }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    oldStatus,
    newStatus,
    hoursAdjusted: wasBillable !== nowBillable,
    hoursResult,
  });
}
