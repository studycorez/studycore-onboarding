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
      .select('id, scheduled_at, duration_minutes, status, fathom_recording_url, fathom_summary, fathom_transcript, recording_verified, report_submitted, homework_due_date, tutor:tutors(id, name)')
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

  // Fetch student-safe report fields for past sessions.
  // NEVER select private_tutor_notes or any other private field here.
  const pastIds = (pastRes.data ?? []).map((s: any) => s.id as string);
  let reportsById: Record<string, { topics_covered: string | null; homework_assigned: string | null }> = {};
  if (pastIds.length) {
    const { data: reps } = await supabase
      .from('session_reports')
      .select('session_id, topics_covered, homework_assigned')
      .in('session_id', pastIds);
    for (const r of (reps ?? []) as any[]) {
      reportsById[r.session_id] = {
        topics_covered:    r.topics_covered    ?? null,
        homework_assigned: r.homework_assigned ?? null,
      };
    }
  }

  const pastWithReports = (pastRes.data ?? []).map((s: any) => {
    const verified = s.recording_verified === true;
    return {
      ...s,
      topics_covered:       reportsById[s.id]?.topics_covered    ?? null,
      homework_assigned:    reportsById[s.id]?.homework_assigned ?? null,
      // Gate: recording fields ONLY when admin has explicitly verified.
      // Null server-side — do NOT rely on the UI to hide unverified data.
      fathom_recording_url: verified ? (s.fathom_recording_url ?? null) : null,
      fathom_summary:       verified ? (s.fathom_summary       ?? null) : null,
      fathom_transcript:    verified ? (s.fathom_transcript     ?? null) : null,
      recording_verified:   verified,
    };
  });

  const permanentZoomLink: string | null = (contractRes.data as any)?.permanent_zoom_link ?? null;

  const upcomingWithLink = (upcomingRes.data ?? []).map((s: any) => ({
    ...s,
    zoom_join_url: s.zoom_join_url ?? permanentZoomLink ?? null,
    permanent_zoom_link: permanentZoomLink,
  }));

  return NextResponse.json({
    upcoming: upcomingWithLink,
    past:     pastWithReports,
    permanent_zoom_link: permanentZoomLink,
  });
}
