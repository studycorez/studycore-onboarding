import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { fromZonedTime } from 'date-fns-tz';
import { format as formatTz } from 'date-fns-tz';
import { addDays, parseISO, getDay, nextDay } from 'date-fns';

export const dynamic = 'force-dynamic';

const DEFAULT_WEEKS_FORWARD = 4;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const { tutor_id, weeks_forward = DEFAULT_WEEKS_FORWARD } = body;

  if (!tutor_id) {
    return NextResponse.json({ error: 'tutor_id is required' }, { status: 400 });
  }

  // ── Step 1: Verify tutor ───────────────────────────────────────────────
  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, active')
    .eq('id', tutor_id)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });
  if (!tutor.active) return NextResponse.json({ error: 'Tutor is inactive' }, { status: 404 });

  // ── Step 2: Fetch schedule rows ────────────────────────────────────────
  const { data: scheduleRows, error: schedErr } = await supabase
    .from('tutor_reported_schedules')
    .select('tutor_id, student_id, day_of_week, time_local, timezone, duration_minutes')
    .eq('tutor_id', tutor_id);

  if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });

  if (!scheduleRows || scheduleRows.length === 0) {
    return NextResponse.json({
      created: 0,
      skipped_dupes: 0,
      deleted_stale: 0,
      conflicts: [],
    });
  }

  // ── Step 3: Delete stale materialized sessions ─────────────────────────
  const { data: deleted, error: delErr } = await supabase
    .from('sessions')
    .delete()
    .eq('source', 'recurring_schedule')
    .eq('tutor_id', tutor_id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .select('id');

  if (delErr) return NextResponse.json({ error: `Delete stale failed: ${delErr.message}` }, { status: 500 });
  const deletedStale = deleted?.length ?? 0;

  // ── Step 4: Generate slots ─────────────────────────────────────────────
  const nowUtc = new Date();
  const slots: { tutor_id: string; student_id: string; scheduled_at: string; duration_minutes: number }[] = [];

  for (const sched of scheduleRows) {
    const tz = sched.timezone;

    // Derive today's calendar date in the schedule's timezone
    let todayInTzString: string;
    try {
      todayInTzString = formatTz(nowUtc, 'yyyy-MM-dd', { timeZone: tz });
    } catch (err: any) {
      return NextResponse.json({ error: `Invalid timezone: ${tz}` }, { status: 400 });
    }
    const todayInTz = parseISO(todayInTzString); // midnight UTC of that calendar day

    // Find next occurrence of day_of_week on or after today
    let firstOccurrence: Date;
    if (getDay(todayInTz) === sched.day_of_week) {
      firstOccurrence = todayInTz;
    } else {
      firstOccurrence = nextDay(todayInTz, sched.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    }

    // Parse time_local "HH:MM" or "HH:MM:SS"
    const [hours, minutes] = sched.time_local.split(':').map(Number);

    for (let week = 0; week < weeks_forward; week++) {
      const targetDate = addDays(firstOccurrence, week * 7);

      // Construct wall clock from UTC-anchored date + local time
      const wallClock = new Date(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        hours, minutes, 0, 0,
      );

      // Convert wall clock in tz → UTC (handles DST)
      const scheduledAtUtc = fromZonedTime(wallClock, tz);

      // Skip slots in the past
      if (scheduledAtUtc <= nowUtc) continue;

      slots.push({
        tutor_id: sched.tutor_id,
        student_id: sched.student_id,
        scheduled_at: scheduledAtUtc.toISOString(),
        duration_minutes: sched.duration_minutes,
      });
    }
  }

  // ── Step 5+6: Dedup + insert ───────────────────────────────────────────
  // Fetch all existing sessions for this tutor in the window for dedup
  const windowEnd = addDays(nowUtc, weeks_forward * 7 + 1);
  const { data: existingSessions } = await supabase
    .from('sessions')
    .select('tutor_id, student_id, scheduled_at')
    .eq('tutor_id', tutor_id)
    .gte('scheduled_at', nowUtc.toISOString())
    .lte('scheduled_at', windowEnd.toISOString());

  const existingKeys = new Set(
    (existingSessions ?? []).map((s: any) =>
      `${s.tutor_id}|${s.student_id}|${s.scheduled_at}`
    ),
  );

  let created = 0;
  let skippedDupes = 0;

  // Batch non-duplicate slots
  const toInsert: typeof slots = [];
  for (const slot of slots) {
    const key = `${slot.tutor_id}|${slot.student_id}|${slot.scheduled_at}`;
    if (existingKeys.has(key)) {
      skippedDupes++;
    } else {
      toInsert.push(slot);
    }
  }

  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from('sessions')
      .insert(
        toInsert.map(s => ({
          ...s,
          status: 'scheduled',
          source: 'recurring_schedule',
        })),
      )
      .select('id');

    if (insertErr) {
      return NextResponse.json({ error: `Materialize failed: ${insertErr.message}` }, { status: 500 });
    }
    created = inserted?.length ?? 0;
  }

  // ── Step 7: Conflict detection ─────────────────────────────────────────
  // Build a Set of generated slot keys for alignment classification
  const slotKeys = new Set(slots.map(s => `${s.student_id}|${new Date(s.scheduled_at).getTime()}`));
  const scheduleStudentIds = [...new Set(scheduleRows.map((s: any) => s.student_id as string))];
  const scheduleStudentSet = new Set(scheduleStudentIds);

  // Query ALL pre-existing manual sessions for this tutor
  const { data: manualSessions } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, student_id, student:students(name)')
    .eq('tutor_id', tutor_id)
    .is('source', null)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowUtc.toISOString());

  const conflicts: {
    session_id: string;
    scheduled_at: string;
    duration_minutes: number;
    student_id: string;
    student_name: string;
    kind: 'aligned' | 'misaligned';
  }[] = [];

  for (const c of (manualSessions ?? []) as any[]) {
    // Skip students not in the new schedule at all (spec 5c)
    if (!scheduleStudentSet.has(c.student_id)) continue;

    const studentName = (Array.isArray(c.student) ? c.student[0]?.name : c.student?.name) ?? '—';
    const key = `${c.student_id}|${new Date(c.scheduled_at).getTime()}`;
    const kind = slotKeys.has(key) ? 'aligned' as const : 'misaligned' as const;

    conflicts.push({
      session_id: c.id,
      scheduled_at: c.scheduled_at,
      duration_minutes: c.duration_minutes,
      student_id: c.student_id,
      student_name: studentName,
      kind,
    });
  }

  // ── Step 8: Response ───────────────────────────────────────────────────
  return NextResponse.json({
    created,
    skipped_dupes: skippedDupes,
    deleted_stale: deletedStale,
    conflicts,
  });
}
