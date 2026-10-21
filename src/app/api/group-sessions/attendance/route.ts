import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/group-sessions/attendance
// Body: { sessionId, attendances: [{ studentId, attended }] }
export async function POST(req: NextRequest) {
  const { sessionId, attendances } = await req.json();
  if (!sessionId || !Array.isArray(attendances)) {
    return NextResponse.json({ error: 'sessionId and attendances required' }, { status: 400 });
  }

  const attended = attendances.filter((a: { studentId: string; attended: boolean }) => a.attended);
  if (attended.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  // Delete any existing attendance records for this session (idempotent)
  await getDb().from('group_session_attendance').delete().eq('session_id', sessionId);

  // Insert attendance records
  const { error: insertErr } = await getDb().from('group_session_attendance').insert(
    attendances.map((a: { studentId: string; attended: boolean }) => ({
      session_id: sessionId,
      student_id: a.studentId,
      attended: a.attended,
      hours_deducted: a.attended ? 1.0 : 0,
    })),
  );
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Increment hours_used for each attended student
  for (const a of attended) {
    const { data: student } = await getDb()
      .from('students')
      .select('group_session_hours_used, group_session_hours_allocated')
      .eq('id', a.studentId)
      .single();

    if (student) {
      const newUsed = (student.group_session_hours_used ?? 0) + 1.0;
      await getDb().from('students').update({
        group_session_hours_used: Math.min(newUsed, student.group_session_hours_allocated ?? 0),
      }).eq('id', a.studentId);
    }
  }

  return NextResponse.json({ ok: true, recorded: attended.length });
}

// GET /api/group-sessions/attendance?sessionId=...
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

  const { data, error } = await getDb()
    .from('group_session_attendance')
    .select('student_id, attended, hours_deducted')
    .eq('session_id', sessionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attendance: data ?? [] });
}
