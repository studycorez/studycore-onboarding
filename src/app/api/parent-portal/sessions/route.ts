import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .ilike('parent_email', payload.parentEmail);

  if (!students?.length) {
    return NextResponse.json({ upcoming: [], past: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const studentIds = students.map(s => s.id);
  const now = new Date().toISOString();

  const [upcomingRes, pastRes, contractsRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, student_id, scheduled_at, duration_minutes, status, zoom_join_url, tutor:tutors(id, name)')
      .in('student_id', studentIds)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(20),
    supabase
      .from('sessions')
      .select('id, student_id, scheduled_at, duration_minutes, status, fathom_recording_url, report_submitted, topics_covered, student_engagement, session_notes, homework_assigned, homework_due_date, next_session_plan, tutor:tutors(id, name)')
      .in('student_id', studentIds)
      .in('status', ['completed', 'cancelled'])
      .order('scheduled_at', { ascending: false })
      .limit(50),
    supabase
      .from('contracts')
      .select('student_id, permanent_zoom_link')
      .in('student_id', studentIds)
      .eq('status', 'signed')
      .not('permanent_zoom_link', 'is', null)
      .order('created_at', { ascending: false }),
  ]);

  // Attach student names for display
  const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));

  // Build permanent link map: student_id -> link (first/latest signed contract)
  const permanentLinks = new Map<string, string>();
  for (const c of (contractsRes.data ?? []) as any[]) {
    if (c.permanent_zoom_link && !permanentLinks.has(c.student_id)) {
      permanentLinks.set(c.student_id, c.permanent_zoom_link);
    }
  }

  const upcoming = (upcomingRes.data ?? []).map((s: any) => ({
    ...s,
    studentName: studentMap[s.student_id] ?? '',
    zoom_join_url: s.zoom_join_url ?? permanentLinks.get(s.student_id) ?? null,
    permanent_zoom_link: permanentLinks.get(s.student_id) ?? null,
  }));
  const past = (pastRes.data ?? []).map((s: any) => ({ ...s, studentName: studentMap[s.student_id] ?? '' }));

  return NextResponse.json(
    { upcoming, past },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
