import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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

  const [upcomingRes, pastRes, contractRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, zoom_join_url, tutor:tutors(id, name)')
      .eq('student_id', payload.studentId)
      .in('status', ['scheduled'])
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20),
    supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, fathom_recording_url, tutor_notes, report_submitted, topics_covered, student_engagement, session_notes, homework_assigned, homework_due_date, next_session_plan, tutor:tutors(id, name)')
      .eq('student_id', payload.studentId)
      .in('status', ['completed', 'cancelled'])
      .order('scheduled_at', { ascending: false })
      .limit(30),
    supabase
      .from('contracts')
      .select('permanent_zoom_link')
      .eq('student_id', payload.studentId)
      .eq('status', 'signed')
      .not('permanent_zoom_link', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const permanentZoomLink: string | null = (contractRes.data as any)?.permanent_zoom_link ?? null;

  const upcomingWithLink = (upcomingRes.data ?? []).map((s: any) => ({
    ...s,
    zoom_join_url: s.zoom_join_url ?? permanentZoomLink ?? null,
    permanent_zoom_link: permanentZoomLink,
  }));

  return NextResponse.json({
    upcoming: upcomingWithLink,
    past:     (pastRes.data as any[]) ?? [],
    permanent_zoom_link: permanentZoomLink,
  });
}
