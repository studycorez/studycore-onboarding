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

  // ── Fetch session_reports for all past sessions (parent-visible fields only) ──
  const pastSessions = pastRes.data ?? [];
  const pastSessionIds = pastSessions.map((s: any) => s.id as string);
  const reportMap = new Map<string, any>(); // session_id → report

  if (pastSessionIds.length > 0) {
    const { data: reports } = await supabase
      .from('session_reports')
      .select('id, session_id, topics_covered, engagement_rating, homework_assigned, concerns_for_parent, target_score_range, extra_practice_areas')
      .in('session_id', pastSessionIds);
    // private_tutor_notes, override_student_name, admin_approved_* intentionally excluded

    if (reports?.length) {
      // Fetch homework_items for all reports
      const reportIds = reports.map((r: any) => r.id as string);
      const { data: hwItems } = await supabase
        .from('homework_items')
        .select('session_report_id, description, estimated_minutes, completed')
        .in('session_report_id', reportIds);

      const hwByReport = new Map<string, any[]>();
      for (const item of (hwItems ?? []) as any[]) {
        if (!hwByReport.has(item.session_report_id)) hwByReport.set(item.session_report_id, []);
        hwByReport.get(item.session_report_id)!.push({
          description:       item.description,
          estimated_minutes: item.estimated_minutes,
          completed:         item.completed,
        });
      }

      for (const r of reports as any[]) {
        reportMap.set(r.session_id, {
          topics_covered:      r.topics_covered,
          engagement_rating:   r.engagement_rating,
          homework_assigned:   r.homework_assigned,
          concerns_for_parent: r.concerns_for_parent,
          target_score_range:  r.target_score_range,
          extra_practice_areas: r.extra_practice_areas,
          homework_items:      hwByReport.get(r.id) ?? [],
        });
      }
    }
  }

  const upcoming = (upcomingRes.data ?? []).map((s: any) => ({
    ...s,
    studentName: studentMap[s.student_id] ?? '',
    zoom_join_url: s.zoom_join_url ?? permanentLinks.get(s.student_id) ?? null,
    permanent_zoom_link: permanentLinks.get(s.student_id) ?? null,
  }));
  const past = pastSessions.map((s: any) => ({
    ...s,
    studentName: studentMap[s.student_id] ?? '',
    session_report: reportMap.get(s.id) ?? null,
  }));

  return NextResponse.json(
    { upcoming, past },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
