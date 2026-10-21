import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();
  const studentId = params.id;

  // Verify ownership: tutor must have at least one session with this student
  const { data: ownerCheck } = await supabase
    .from('sessions')
    .select('id')
    .eq('tutor_id', payload.tutorId)
    .eq('student_id', studentId)
    .limit(1)
    .maybeSingle();

  if (!ownerCheck) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  const [studentRes, upcomingRes, pastRes, progressRes] = await Promise.all([
    supabase.from('students').select('*').eq('id', studentId).single(),

    supabase.from('sessions')
      .select('*, zoom_join_url, zoom_meeting_id')
      .eq('tutor_id', payload.tutorId)
      .eq('student_id', studentId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true }),

    supabase.from('sessions')
      .select('*, session_report:session_reports(id, submitted_at, topics_covered, engagement_rating, private_tutor_notes)')
      .eq('tutor_id', payload.tutorId)
      .eq('student_id', studentId)
      .lt('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: false }),

    supabase.from('student_progress')
      .select('*')
      .eq('student_id', studentId)
      .order('recorded_at', { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    student:  studentRes.data ?? null,
    upcoming: upcomingRes.data ?? [],
    past:     pastRes.data ?? [],
    progress: progressRes.data ?? [],
  });
}
