import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const tutorId = params.id;
  const nowIso = new Date().toISOString();

  // Fetch tutor
  const { data: tutor, error: tutorErr } = await supabase
    .from('tutors')
    .select('id, name, email, timezone, hourly_rate, active')
    .eq('id', tutorId)
    .maybeSingle();

  if (tutorErr || !tutor) {
    return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
  }

  if (!tutor.active) {
    return NextResponse.json({ error: 'Tutor is inactive' }, { status: 404 });
  }

  // Fetch contracts, schedules, upcoming sessions, past sessions in parallel
  const [
    { data: contracts },
    { data: schedules },
    { data: upcomingSessions },
    { data: pastSessions },
  ] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, student_id, hourly_rate, status, signed_at, student:students(name, email, parent_email, status)')
      .eq('tutor_id', tutorId)
      .eq('status', 'signed')
      .order('signed_at', { ascending: false }),
    supabase
      .from('tutor_reported_schedules')
      .select('id, student_id, day_of_week, time_local, timezone, duration_minutes, recurring_started_on, notes, reported_at')
      .eq('tutor_id', tutorId)
      .order('day_of_week', { ascending: true })
      .order('time_local', { ascending: true }),
    supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, source, student_id, student:students(name), zoom_meeting_id, fathom_recording_url, hours_finalized, attested_at')
      .eq('tutor_id', tutorId)
      .gte('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, source, student_id, student:students(name), zoom_meeting_id, fathom_recording_url, hours_finalized, attested_at')
      .eq('tutor_id', tutorId)
      .lt('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: false })
      .limit(500),
  ]);

  // Batch-check session_reports for all session IDs
  const allSessionIds = [
    ...(upcomingSessions ?? []).map((s: any) => s.id),
    ...(pastSessions ?? []).map((s: any) => s.id),
  ];
  const reportSet = new Set<string>();
  if (allSessionIds.length > 0) {
    const { data: reports } = await supabase
      .from('session_reports')
      .select('session_id')
      .in('session_id', allSessionIds);
    for (const r of reports ?? []) {
      reportSet.add(r.session_id);
    }
  }

  function mapSession(s: any) {
    const studentName = (Array.isArray(s.student) ? s.student[0]?.name : s.student?.name) ?? '—';
    return {
      id: s.id,
      scheduled_at: s.scheduled_at,
      duration_minutes: s.duration_minutes,
      status: s.status,
      source: s.source,
      student_id: s.student_id,
      student_name: studentName,
      has_zoom: !!s.zoom_meeting_id,
      has_fathom: !!s.fathom_recording_url,
      has_session_report: reportSet.has(s.id),
      hours_finalized: !!s.hours_finalized,
      attested_at: s.attested_at,
    };
  }

  // Build student name map for schedules
  const studentNameMap: Record<string, string> = {};
  for (const c of (contracts ?? []) as any[]) {
    const name = Array.isArray(c.student) ? c.student[0]?.name : c.student?.name;
    if (name && c.student_id) studentNameMap[c.student_id] = name;
  }

  const scheduleStudentIds = new Set<string>(
    (schedules ?? []).map((s: any) => s.student_id as string).filter(Boolean)
  );
  const missingIds = [...scheduleStudentIds].filter((id: string) => !studentNameMap[id]);
  if (missingIds.length > 0) {
    const { data: extraStudents } = await supabase
      .from('students')
      .select('id, name')
      .in('id', missingIds);
    for (const s of extraStudents ?? []) {
      studentNameMap[s.id] = s.name;
    }
  }

  return NextResponse.json({
    tutor,
    contracts: (contracts ?? []).map((c: any) => {
      const student = Array.isArray(c.student) ? c.student[0] : c.student;
      return {
        id: c.id,
        student_id: c.student_id,
        student_name: student?.name ?? '—',
        student_email: student?.email ?? null,
        parent_email: student?.parent_email ?? null,
        student_status: student?.status ?? 'active',
        hourly_rate: c.hourly_rate,
        status: c.status,
        signed_at: c.signed_at,
      };
    }),
    schedules: (schedules ?? []).map((s: any) => ({
      ...s,
      student_name: studentNameMap[s.student_id] ?? '—',
    })),
    upcoming_sessions: (upcomingSessions ?? []).map(mapSession),
    past_sessions: (pastSessions ?? []).map(mapSession),
  });
}
