import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  // Fetch homework_items for this student, joining session_reports → sessions → tutors
  const { data, error } = await supabase
    .from('homework_items')
    .select(`
      id,
      description,
      estimated_minutes,
      completed,
      completed_at,
      session_report_id,
      session_report:session_reports(
        id,
        session:sessions(
          id,
          scheduled_at,
          duration_minutes,
          tutor:tutors(id, name)
        )
      )
    `)
    .eq('student_id', payload.studentId);

  if (error) {
    console.error('[homework/items] fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten the nested join into a simple shape for the client
  const items = (data ?? []).map((row: any) => {
    const report  = Array.isArray(row.session_report) ? row.session_report[0] : row.session_report;
    const session = Array.isArray(report?.session)    ? report.session[0]     : report?.session;
    const tutor   = Array.isArray(session?.tutor)     ? session.tutor[0]      : session?.tutor;
    return {
      id:                    row.id as string,
      description:           row.description as string,
      estimated_minutes:     row.estimated_minutes as number | null,
      completed:             row.completed as boolean,
      completed_at:          row.completed_at as string | null,
      session_report_id:     row.session_report_id as string,
      session_id:            session?.id as string ?? null,
      session_scheduled_at:  session?.scheduled_at as string ?? null,
      session_duration_minutes: session?.duration_minutes as number ?? null,
      tutor_name:            tutor?.name as string ?? '—',
    };
  });

  // Sort by session date descending (newest first)
  items.sort((a, b) => {
    if (!a.session_scheduled_at) return 1;
    if (!b.session_scheduled_at) return -1;
    return b.session_scheduled_at.localeCompare(a.session_scheduled_at);
  });

  return NextResponse.json({ items });
}
