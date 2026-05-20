import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { computePayableMinutes } from '@/lib/payroll';
import {
  PAYROLL_CUTOFF,
  isSessionPayable,
  fetchFiledSessionIds,
} from '@/lib/payroll-eligibility';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// POST /api/admin/payroll/generate
// body: { period_start: 'YYYY-MM-DD', period_end: 'YYYY-MM-DD' }
// returns: { run_id, line_items, excluded }
//
// Eligibility hard-gate (all conditions required):
//   - status = 'completed'
//   - paid_in_run_id IS NULL
//   - pre-cutoff (< 2026-05-15): no report needed (legacy safety net)
//   - post-cutoff (>= 2026-05-15): session_report must exist AND
//     report.tutor_attended != 'no_show'
//
// Catch-up: sessions before period_start AND >= PAYROLL_CUTOFF that are
// now payable (their reports were filed late but within the backlog window).
// Historical pre-cutoff sessions are already stamped by the settle script.
//
// On line_item insert failure the run + any stamps are rolled back.
export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { period_start, period_end } = body;
  if (!period_start || !period_end) {
    return NextResponse.json({ error: 'period_start and period_end required' }, { status: 400 });
  }

  const supabase = makeServiceSupabase();

  // ── Collision check: exact period ─────────────────────────────────────────
  const { data: existingRuns } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('period_start', period_start)
    .eq('period_end', period_end)
    .limit(1);

  if (existingRuns?.length) {
    const existing = existingRuns[0] as { id: string; status: string };
    if (existing.status === 'paid') {
      return NextResponse.json(
        { error: 'A paid run exists for this period. Void it first to regenerate.' },
        { status: 409 },
      );
    }
    // Pending run — clear before regenerating
    // Un-stamp sessions in batches
    const BATCH = 200;
    let offset = 0;
    while (true) {
      const { data: stamped } = await supabase
        .from('sessions')
        .select('id')
        .eq('paid_in_run_id', existing.id)
        .range(offset, offset + BATCH - 1);
      if (!stamped?.length) break;
      await supabase
        .from('sessions')
        .update({ paid_in_run_id: null })
        .in('id', stamped.map((s: any) => s.id as string));
      if (stamped.length < BATCH) break;
      offset += BATCH;
    }
    await supabase.from('payroll_line_items').delete().eq('payroll_run_id', existing.id);
    await supabase.from('payroll_runs').delete().eq('id', existing.id);
  }

  // ── Fetch tutors for rate lookup ──────────────────────────────────────────
  const { data: tutors } = await supabase.from('tutors').select('id, name, hourly_rate');
  const tutorMap = new Map(
    (tutors ?? []).map((t: any) => [t.id as string, t as { id: string; name: string; hourly_rate: number | null }]),
  );

  // ── Fetch candidate sessions ───────────────────────────────────────────────
  // ghost sessions excluded by attendance_review_status filter
  const ghostFilter = 'attendance_review_status.is.null,attendance_review_status.eq.real_confirmed';

  // Current period: scheduled within [period_start, period_end], unpaid
  const { data: currentCandidates, error: currentErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, duration_minutes, status, paid_in_run_id, scheduled_at')
    .eq('status', 'completed')
    .is('paid_in_run_id', null)
    .gte('scheduled_at', period_start + 'T00:00:00.000Z')
    .lte('scheduled_at', period_end   + 'T23:59:59.999Z')
    .or(ghostFilter);

  if (currentErr) return NextResponse.json({ error: currentErr.message }, { status: 500 });

  // Catch-up: before period_start, on/after PAYROLL_CUTOFF, unpaid
  // (Pre-cutoff sessions are already stamped by the settle script, so
  //  the >= PAYROLL_CUTOFF filter prevents re-processing them.)
  const { data: catchupCandidates, error: catchupErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, duration_minutes, status, paid_in_run_id, scheduled_at')
    .eq('status', 'completed')
    .is('paid_in_run_id', null)
    .lt('scheduled_at', period_start + 'T00:00:00.000Z')
    .gte('scheduled_at', PAYROLL_CUTOFF)
    .or(ghostFilter);

  if (catchupErr) return NextResponse.json({ error: catchupErr.message }, { status: 500 });

  // ── Fetch session_reports: eligibility + report duration for pay calc ─────
  const allCandidates = [...(currentCandidates ?? []), ...(catchupCandidates ?? [])];
  const allIds = allCandidates.map((s: any) => s.id as string);
  // filedReports: Map<session_id, { duration_minutes }> — use .has() for
  // eligibility, .get()?.duration_minutes for pay (report-reported duration,
  // not the scheduled duration on sessions.duration_minutes).
  const filedReports = await fetchFiledSessionIds(supabase, allIds);

  // ── Split payable vs excluded ─────────────────────────────────────────────
  const payableCurrent  = (currentCandidates  ?? []).filter((s: any) => isSessionPayable(s, filedReports));
  const payableCatchup  = (catchupCandidates  ?? []).filter((s: any) => isSessionPayable(s, filedReports));
  // Excluded = in-period, attended, post-cutoff, no report
  const excludedCurrent = (currentCandidates  ?? []).filter((s: any) => !isSessionPayable(s, filedReports));

  const excludedByTutor = new Map<string, { tutor_name: string; count: number }>();
  for (const s of excludedCurrent) {
    const tutor = tutorMap.get((s as any).tutor_id as string);
    if (!tutor) continue;
    const entry = excludedByTutor.get((s as any).tutor_id) ?? { tutor_name: tutor.name, count: 0 };
    entry.count += 1;
    excludedByTutor.set((s as any).tutor_id, entry);
  }

  // ── Outlier flagging ──────────────────────────────────────────────────────
  // Flagged = report duration > scheduled duration + 15 min.
  // Still paid — flagging is informational for admin review only.
  type FlaggedSession = {
    tutor_id: string;
    tutor_name: string;
    session_id: string;
    scheduled_at: string;
    scheduled_minutes: number;
    reported_minutes: number;
  };
  const flagged: FlaggedSession[] = [];

  function checkOutlier(s: any): void {
    const sessionId = s.id as string;
    const report = filedReports.get(sessionId);
    if (!report) return; // pre-cutoff legacy: no report, skip outlier check
    const scheduledMins = s.duration_minutes as number ?? 0;
    const reportedMins  = report.duration_minutes;
    if (reportedMins > scheduledMins + 15) {
      const tutor = tutorMap.get(s.tutor_id as string);
      flagged.push({
        tutor_id:          s.tutor_id as string,
        tutor_name:        tutor?.name ?? s.tutor_id,
        session_id:        sessionId,
        scheduled_at:      s.scheduled_at as string,
        scheduled_minutes: scheduledMins,
        reported_minutes:  reportedMins,
      });
    }
  }

  // ── Aggregate by tutor ────────────────────────────────────────────────────
  type TutorLine = {
    tutor_id: string;
    tutor_name: string;
    hourly_rate: number;
    current_ids: string[];
    catchup_ids: string[];
    current_period_minutes: number;
    catchup_minutes: number;
    total_minutes: number;
    payable_minutes: number;
    amount_owed: number;
  };
  const tutorLines = new Map<string, TutorLine>();

  function ensureLine(tutorId: string): TutorLine | null {
    const tutor = tutorMap.get(tutorId);
    if (!tutor || !tutor.hourly_rate) return null; // skip tutors with no rate
    if (!tutorLines.has(tutorId)) {
      tutorLines.set(tutorId, {
        tutor_id:               tutorId,
        tutor_name:             tutor.name,
        hourly_rate:            tutor.hourly_rate,
        current_ids:            [],
        catchup_ids:            [],
        current_period_minutes: 0,
        catchup_minutes:        0,
        total_minutes:          0,
        payable_minutes:        0,
        amount_owed:            0,
      });
    }
    return tutorLines.get(tutorId)!;
  }

  for (const s of payableCurrent) {
    const line = ensureLine((s as any).tutor_id as string);
    if (!line) continue;
    // Use report's duration_minutes for pay; fall back to scheduled if missing
    const report = filedReports.get((s as any).id as string);
    const reportedMins   = report?.duration_minutes ?? (s as any).duration_minutes as number ?? 0;
    const scheduledMins  = (s as any).duration_minutes as number ?? 0;
    checkOutlier(s);
    line.current_ids.push((s as any).id as string);
    line.current_period_minutes += reportedMins;
    line.total_minutes += reportedMins;
    line.payable_minutes += computePayableMinutes(reportedMins);
    // Log fallback if report duration was missing (should not happen post-cutoff)
    if (!report) console.warn('[payroll] no report duration for session', (s as any).id, '— used scheduled', scheduledMins);
  }

  for (const s of payableCatchup) {
    const line = ensureLine((s as any).tutor_id as string);
    if (!line) continue;
    const report = filedReports.get((s as any).id as string);
    const reportedMins  = report?.duration_minutes ?? (s as any).duration_minutes as number ?? 0;
    checkOutlier(s);
    line.catchup_ids.push((s as any).id as string);
    line.catchup_minutes += reportedMins;
    line.total_minutes += reportedMins;
    line.payable_minutes += computePayableMinutes(reportedMins);
    if (!report) console.warn('[payroll] no report duration for catch-up session', (s as any).id);
  }

  for (const line of tutorLines.values()) {
    line.amount_owed = parseFloat(((line.payable_minutes / 60) * line.hourly_rate).toFixed(2));
  }

  const lines = Array.from(tutorLines.values())
    .filter(l => l.current_ids.length + l.catchup_ids.length > 0)
    .sort((a, b) => a.tutor_name.localeCompare(b.tutor_name));

  const excluded = Array.from(excludedByTutor.entries()).map(([tutor_id, e]) => ({
    tutor_id,
    tutor_name:     e.tutor_name,
    excluded_count: e.count,
  }));

  if (lines.length === 0) {
    return NextResponse.json({ run_id: null, line_items: [], excluded, flagged });
  }

  // ── Create payroll_run ────────────────────────────────────────────────────
  const totalAmount = parseFloat(lines.reduce((s, l) => s + l.amount_owed, 0).toFixed(2));
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .insert({ period_start, period_end, total_amount: totalAmount, status: 'pending' })
    .select('id')
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message ?? 'Failed to create run' }, { status: 500 });
  }
  const runId = (run as any).id as string;

  // ── Insert line items ─────────────────────────────────────────────────────
  const lineItems = lines.map(l => ({
    payroll_run_id:         runId,
    tutor_id:               l.tutor_id,
    sessions_count:         l.current_ids.length + l.catchup_ids.length,
    total_minutes:          l.total_minutes,
    hourly_rate:            l.hourly_rate,
    amount_owed:            l.amount_owed,
    status:                 'pending',
    actually_paid_amount:   null,
    paid_at:                null,
    current_period_minutes: l.current_period_minutes,
    catchup_minutes:        l.catchup_minutes,
    catchup_sessions_count: l.catchup_ids.length,
  }));

  const { error: itemsErr } = await supabase.from('payroll_line_items').insert(lineItems);
  if (itemsErr) {
    // Rollback: delete the run (no sessions stamped yet)
    await supabase.from('payroll_runs').delete().eq('id', runId);
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // ── Stamp sessions with paid_in_run_id ────────────────────────────────────
  const allPayableIds = lines.flatMap(l => [...l.current_ids, ...l.catchup_ids]);
  if (allPayableIds.length > 0) {
    const BATCH = 200;
    const stampFailed: string[] = [];
    for (let i = 0; i < allPayableIds.length; i += BATCH) {
      const chunk = allPayableIds.slice(i, i + BATCH);
      const { error: stampErr } = await supabase
        .from('sessions')
        .update({ paid_in_run_id: runId })
        .in('id', chunk);
      if (stampErr) {
        stampFailed.push(...chunk);
      }
    }

    if (stampFailed.length > 0) {
      // Rollback: un-stamp anything that got stamped, delete line items + run
      await supabase.from('sessions').update({ paid_in_run_id: null }).eq('paid_in_run_id', runId);
      await supabase.from('payroll_line_items').delete().eq('payroll_run_id', runId);
      await supabase.from('payroll_runs').delete().eq('id', runId);
      return NextResponse.json({ error: 'Failed to stamp sessions — run rolled back.' }, { status: 500 });
    }
  }

  // ── Build response ────────────────────────────────────────────────────────
  const responseItems = lines.map(l => ({
    tutor_id:               l.tutor_id,
    tutor_name:             l.tutor_name,
    hourly_rate:            l.hourly_rate,
    sessions_count:         l.current_ids.length + l.catchup_ids.length,
    current_period_minutes: l.current_period_minutes,
    catchup_minutes:        l.catchup_minutes,
    catchup_sessions_count: l.catchup_ids.length,
    total_minutes:          l.total_minutes,
    payable_minutes:        l.payable_minutes,
    amount_owed:            l.amount_owed,
    status:                 'pending' as const,
    actually_paid_amount:   null as number | null,
  }));

  return NextResponse.json({ run_id: runId, line_items: responseItems, excluded, flagged });
}
