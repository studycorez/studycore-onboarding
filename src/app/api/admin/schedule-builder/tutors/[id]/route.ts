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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const tutorId = params.id;

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

  // Fetch signed contracts + schedules in parallel
  const [{ data: contracts }, { data: schedules }] = await Promise.all([
    supabase
      .from('contracts')
      .select('id, student_id, hourly_rate, status, signed_at, student:students(name)')
      .eq('tutor_id', tutorId)
      .eq('status', 'signed')
      .order('signed_at', { ascending: false }),
    supabase
      .from('tutor_reported_schedules')
      .select('id, student_id, day_of_week, time_local, timezone, duration_minutes, recurring_started_on, notes, reported_at')
      .eq('tutor_id', tutorId)
      .order('day_of_week', { ascending: true })
      .order('time_local', { ascending: true }),
  ]);

  // Collect student IDs from schedules for name lookup
  const scheduleStudentIds = new Set<string>(
    (schedules ?? []).map((s: any) => s.student_id as string).filter(Boolean)
  );
  // Also get names from contracts for quick lookup
  const studentNameMap: Record<string, string> = {};
  for (const c of (contracts ?? []) as any[]) {
    const name = Array.isArray(c.student) ? c.student[0]?.name : c.student?.name;
    if (name && c.student_id) studentNameMap[c.student_id] = name;
  }

  // Fetch any schedule student names not already in contracts
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
    contracts: (contracts ?? []).map((c: any) => ({
      id: c.id,
      student_id: c.student_id,
      student_name: (Array.isArray(c.student) ? c.student[0]?.name : c.student?.name) ?? '—',
      hourly_rate: c.hourly_rate,
      status: c.status,
      signed_at: c.signed_at,
    })),
    schedules: (schedules ?? []).map((s: any) => ({
      ...s,
      student_name: studentNameMap[s.student_id] ?? '—',
    })),
  });
}
