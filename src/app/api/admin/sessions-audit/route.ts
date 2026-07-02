import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '@/lib/supabase-helpers';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = makeSupabase();
    const { searchParams } = new URL(req.url);

    const startDate = searchParams.get('start_date');
    const endDate   = searchParams.get('end_date');
    const tutorId   = searchParams.get('tutor_id');
    const studentId = searchParams.get('student_id');
    // status can be repeated: ?status=completed&status=scheduled
    const statuses  = searchParams.getAll('status');
    const hasLogStr = searchParams.get('has_log');
    const hasLog    = hasLogStr === null ? null : hasLogStr === 'true';

    const attendance = searchParams.get('attendance'); // 'present' | 'absent' | 'pending' | null
    const review     = searchParams.get('review');     // 'ghost_pending' | 'ghost_confirmed' | 'real_confirmed' | 'unreviewed' | null

    // Build sessions query — LEFT JOIN tutors + students via PostgREST embed
    let query = supabase
      .from('sessions')
      .select('id, tutor_id, student_id, scheduled_at, duration_minutes, status, log_request_sent, tutor_attended, student_attended, actual_runtime_minutes, zoom_attendance_synced_at, attendance_review_status, tutors(id, name), students(id, name)')
      .order('scheduled_at', { ascending: false });

    if (startDate) query = query.gte('scheduled_at', startDate + 'T00:00:00.000Z');
    if (endDate)   query = query.lte('scheduled_at', endDate   + 'T23:59:59.999Z');
    if (tutorId)   query = query.eq('tutor_id', tutorId);
    if (studentId) query = query.eq('student_id', studentId);
    if (statuses.length > 0) query = query.in('status', statuses);
    if (attendance === 'present') query = query.eq('tutor_attended', true);
    if (attendance === 'absent')  query = query.eq('tutor_attended', false);
    if (attendance === 'pending') query = query.is('tutor_attended', null);
    if (review === 'ghost_pending')   query = query.eq('attendance_review_status', 'ghost_pending');
    if (review === 'ghost_confirmed') query = query.eq('attendance_review_status', 'ghost_confirmed');
    if (review === 'real_confirmed')  query = query.eq('attendance_review_status', 'real_confirmed');
    if (review === 'unreviewed')      query = query.is('attendance_review_status', null);

    let rawSessions: any[];
    try {
      rawSessions = await fetchAllPaginated(query as any);
    } catch (err: any) {
      console.error('[sessions-audit] fetchAllPaginated failed:', err.message, err.stack);
      return NextResponse.json({ error: err.message ?? 'Failed to fetch sessions' }, { status: 500 });
    }

    // Fetch session_logs for all matched session IDs in a single query
    const sessionIds = rawSessions.map((s: any) => s.id);
    const logMap = new Map<string, any>();

    if (sessionIds.length > 0) {
      const BATCH_SIZE = 200; // each id is ~37 chars, 200 ids = ~7.4KB url, safe under 16KB limit
      const allLogs: any[] = [];

      for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
        const chunk = sessionIds.slice(i, i + BATCH_SIZE);
        const { data: logs, error: logErr } = await supabase
          .from('session_reports')
          .select('id, session_id, duration_minutes, submitted_at')
          .in('session_id', chunk)
          .order('submitted_at', { ascending: false });

        if (logErr) {
          console.error('[sessions-audit] session_reports batch failed:', { batchStart: i, chunkSize: chunk.length, error: logErr });
          return NextResponse.json({ error: logErr.message }, { status: 500 });
        }

        if (logs) allLogs.push(...logs);
      }

      // Sort all logs descending by submitted_at to ensure most-recent-first
      // dedup works across batches (each batch was sorted, but the union isn't)
      allLogs.sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));

      // Keep only the most recent log per session
      for (const log of allLogs) {
        if (!logMap.has(log.session_id)) {
          logMap.set(log.session_id, log);
        }
      }
    }

    // Assemble rows
    let rows = rawSessions.map((s: any) => {
      const tutor   = s.tutors   as { id: string; name: string } | null;
      const student = s.students as { id: string; name: string } | null;
      const log     = logMap.get(s.id) ?? null;

      return {
        id:                          s.id as string,
        tutor_id:                    s.tutor_id as string,
        tutor_name:                  tutor?.name ?? '—',
        student_id:                  s.student_id as string,
        student_name:                student?.name ?? '—',
        scheduled_at:                s.scheduled_at as string,
        scheduled_duration_minutes:  (s.duration_minutes ?? 0) as number,
        status:                      s.status as string,
        log_request_sent:            (s.log_request_sent ?? false) as boolean,
        tutor_attended:              (s.tutor_attended ?? null) as boolean | null,
        student_attended:            (s.student_attended ?? null) as boolean | null,
        actual_runtime_minutes:      (s.actual_runtime_minutes ?? null) as number | null,
        zoom_attendance_synced_at:   (s.zoom_attendance_synced_at ?? null) as string | null,
        attendance_review_status:    (s.attendance_review_status ?? null) as string | null,
        log: log ? {
          id:                      log.id as string,
          actual_duration_minutes: (log.duration_minutes ?? 0) as number,
          submitted_at:            log.submitted_at as string,
        } : null,
      };
    });

    // Apply has_log filter in code (simpler than wrestling PostgREST join filters)
    if (hasLog === true)  rows = rows.filter(r => r.log !== null);
    if (hasLog === false) rows = rows.filter(r => r.log === null);

    // Compute summary
    const total                   = rows.length;
    const withLog                 = rows.filter(r => r.log !== null).length;
    const withoutLog              = total - withLog;
    const totalScheduledMinutes   = rows.reduce((s, r) => s + r.scheduled_duration_minutes, 0);
    const loggedRows              = rows.filter(r => r.log !== null);
    const totalLoggedMinutes      = loggedRows.reduce((s, r) => s + (r.log!.actual_duration_minutes), 0);
    const totalDiscrepancyMinutes = loggedRows.reduce(
      (s, r) => s + (r.log!.actual_duration_minutes - r.scheduled_duration_minutes),
      0,
    );

    return NextResponse.json({
      sessions: rows,
      summary: {
        total,
        with_log:                  withLog,
        without_log:               withoutLog,
        total_scheduled_minutes:   totalScheduledMinutes,
        total_logged_minutes:      totalLoggedMinutes,
        total_discrepancy_minutes: totalDiscrepancyMinutes,
      },
    });
  } catch (err: any) {
    console.error('[sessions-audit] unhandled error:', err.message, err.stack);
    return NextResponse.json({ error: err.message ?? 'Unexpected error' }, { status: 500 });
  }
}
