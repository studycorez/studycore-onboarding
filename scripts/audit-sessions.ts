/**
 * Audit future sessions for day-of-week mismatches.
 *
 * For each upcoming scheduled session, checks whether the session's
 * day-of-week (in the student's timezone, defaulting to America/New_York)
 * matches any of the student's availability slots.  Sessions that land on
 * a day with NO matching availability are flagged as potentially wrong.
 *
 * Dry run:  npx ts-node --project tsconfig.json scripts/audit-sessions.ts
 * Fix run:  npx ts-node --project tsconfig.json scripts/audit-sessions.ts --write
 *
 * The script NEVER guesses which day to move a session to — it just
 * reports the mismatch so you can decide.  Use --write only after
 * carefully reviewing the dry-run output.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const WRITE = process.argv.includes('--write');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Day names, 0 = Sunday
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Get day-of-week (0=Sun) of a UTC ISO timestamp in the given IANA timezone */
function dowInTz(utcIso: string, tz: string): number {
  const d = new Date(utcIso);
  const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(short);
}

async function main() {
  // 1. Fetch all upcoming scheduled sessions (with student data)
  const now = new Date().toISOString();
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('id, scheduled_at, duration_minutes, student_id, tutor_id, student:students(name, timezone)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)
    .order('scheduled_at');

  if (sessErr || !sessions) {
    console.error('Failed to fetch sessions:', sessErr);
    process.exit(1);
  }

  // 2. Fetch all student availability
  const { data: avail, error: availErr } = await supabase
    .from('student_availability')
    .select('student_id, day_of_week, start_time, end_time')
    .eq('is_active', true);

  if (availErr || !avail) {
    console.error('Failed to fetch availability:', availErr);
    process.exit(1);
  }

  // Build availability index
  const availByStudent: Record<string, number[]> = {};
  for (const a of avail) {
    if (!availByStudent[a.student_id]) availByStudent[a.student_id] = [];
    if (!availByStudent[a.student_id].includes(a.day_of_week)) {
      availByStudent[a.student_id].push(a.day_of_week);
    }
  }

  // 3. Audit
  const mismatches: {
    id: string;
    scheduled_at: string;
    student_name: string;
    tz: string;
    session_dow: number;
    expected_dows: number[];
  }[] = [];

  for (const s of sessions) {
    const student = (s as any).student;
    const tz = student?.timezone ?? 'America/New_York';
    const sessionDow = dowInTz(s.scheduled_at, tz);
    const expectedDows = availByStudent[s.student_id] ?? [];

    // If student has no availability recorded, skip (can't audit)
    if (expectedDows.length === 0) continue;

    if (!expectedDows.includes(sessionDow)) {
      mismatches.push({
        id: s.id,
        scheduled_at: s.scheduled_at,
        student_name: student?.name ?? s.student_id,
        tz,
        session_dow: sessionDow,
        expected_dows: expectedDows,
      });
    }
  }

  // 4. Report
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  SESSION DAY-OF-WEEK AUDIT — ${WRITE ? '⚡ WRITE MODE' : '🔍 DRY RUN'}`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (mismatches.length === 0) {
    console.log('✅  All future sessions match student availability day-of-week.\n');
    return;
  }

  console.log(`Found ${mismatches.length} session(s) on unexpected days:\n`);

  for (const m of mismatches) {
    const sessionDate = new Date(m.scheduled_at).toLocaleDateString('en-US', {
      timeZone: m.tz,
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    console.log(`  Session: ${m.id}`);
    console.log(`  Student: ${m.student_name} (tz: ${m.tz})`);
    console.log(`  Stored:  ${m.scheduled_at}`);
    console.log(`  Local:   ${sessionDate}  [${DAY_NAMES[m.session_dow]}]`);
    console.log(`  Avail:   ${m.expected_dows.map(d => DAY_NAMES[d]).join(', ')}`);
    console.log('');
  }

  if (!WRITE) {
    console.log('👆  Dry run complete. Sessions above are on days NOT in the student\'s availability.\n');
    console.log('    Review carefully before re-running with --write.\n');
    console.log('    Note: --write requires a manual correction map (see script comments).\n');
    return;
  }

  // ── WRITE MODE ─────────────────────────────────────────────────────────────
  // To apply automatic fixes, you need to define how each mismatched session
  // should be corrected.  The safest approach is to shift each session to the
  // nearest available day that IS in the student's availability.
  //
  // IMPORTANT: review every change before confirming.
  console.log('⚠️  Write mode for session date correction requires a manual correction map.');
  console.log('    Please review the dry-run output and define corrections in the script.\n');
  console.log('    No changes were made.\n');
}

main().catch(console.error);
