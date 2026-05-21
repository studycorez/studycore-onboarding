import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// GET /api/admin/logged-sessions
// Returns sessions WHERE created_by_tutor=true AND status='pending_approval',
// joined with their report content and is_assigned_student flag.
export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select(`
      id, scheduled_at, duration_minutes, status,
      tutor:tutors(id, name),
      student:students(id, name)
    `)
    .eq('created_by_tutor', true)
    .eq('status', 'pending_approval')
    .order('scheduled_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!sessions?.length) return NextResponse.json({ sessions: [] });

  const sessionIds = sessions.map((s: any) => s.id as string);

  // Fetch reports for these sessions
  const { data: reports } = await supabase
    .from('session_reports')
    .select('session_id, duration_minutes, topics_covered, homework_assigned, engagement_rating, tutor_attended, private_tutor_notes, submitted_at')
    .in('session_id', sessionIds);

  const reportMap = new Map((reports ?? []).map((r: any) => [r.session_id as string, r]));

  // For each session, compute is_assigned_student:
  // active contract OR a prior completed session (excluding this pending one)
  const results = await Promise.all(sessions.map(async (s: any) => {
    const tutorId   = (s.tutor as any)?.id as string | undefined;
    const studentId = (s.student as any)?.id as string | undefined;

    let isAssigned = false;
    if (tutorId && studentId) {
      const [{ count: cCount }, { count: sCount }] = await Promise.all([
        supabase
          .from('contracts')
          .select('id', { count: 'exact', head: true })
          .eq('tutor_id', tutorId)
          .eq('student_id', studentId)
          .eq('status', 'active'),
        supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('tutor_id', tutorId)
          .eq('student_id', studentId)
          .eq('status', 'completed')
          .neq('id', s.id),
      ]);
      isAssigned = (cCount ?? 0) > 0 || (sCount ?? 0) > 0;
    }

    return {
      id:               s.id,
      scheduled_at:     s.scheduled_at,
      duration_minutes: s.duration_minutes,
      tutor:            s.tutor,
      student:          s.student,
      is_assigned_student: isAssigned,
      report:           reportMap.get(s.id) ?? null,
    };
  }));

  return NextResponse.json({ sessions: results });
}
