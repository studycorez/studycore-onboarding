/**
 * audit-duration-null.ts
 * Check duration_minutes null/zero for all sessions and the 34 affected students specifically.
 * Zero writes.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = Record<string, any>;

async function fetchAll(table: string, select: string, filters: (q: any) => any = q => q): Promise<Row[]> {
  const all: Row[] = [];
  let page = 0;
  while (true) {
    let q = supabase.from(table).select(select);
    q = filters(q);
    q = q.range(page * 1000, page * 1000 + 999);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    page++;
  }
  return all;
}

function pickCanonical(group: Row[]): { canonicalId: string; deleteId: string } {
  const sorted = [...group].sort((a, b) => {
    const aN = a.tutor_id === null ? 1 : 0;
    const bN = b.tutor_id === null ? 1 : 0;
    if (aN !== bN) return aN - bN;
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : 1;
  });
  return { canonicalId: sorted[0].id, deleteId: sorted[1].id };
}

async function main() {
  console.log('\n=== Duration-Null Safety Audit ===\n');

  const sessions = await fetchAll(
    'sessions',
    'id, zoom_meeting_id, student_id, tutor_id, scheduled_at, created_at, status, duration_minutes',
  );
  console.log(`Sessions loaded: ${sessions.length}`);

  // ── Global null/zero stats ─────────────────────────────────────────────────
  const allCompleted = sessions.filter(s => s.status === 'completed' || s.status === 'no_show_student');
  const nullDur   = allCompleted.filter(s => s.duration_minutes === null || s.duration_minutes === undefined);
  const zeroDur   = allCompleted.filter(s => s.duration_minutes === 0);
  const validDur  = allCompleted.filter(s => s.duration_minutes > 0);

  console.log(`\nAll completed/no_show_student sessions: ${allCompleted.length}`);
  console.log(`  duration_minutes IS NULL : ${nullDur.length}`);
  console.log(`  duration_minutes = 0    : ${zeroDur.length}`);
  console.log(`  duration_minutes > 0    : ${validDur.length}`);

  // ── Build delete set ───────────────────────────────────────────────────────
  const groupMap = new Map<string, Row[]>();
  for (const s of sessions) {
    if (!s.zoom_meeting_id) continue;
    const key = `${s.zoom_meeting_id}|${s.student_id}|${s.scheduled_at}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(s);
    groupMap.set(key, arr);
  }
  const dupeGroups = [...groupMap.values()].filter(g => g.length > 1);
  const deleteIdSet = new Set<string>();
  const affectedStudentIds = new Set<string>();
  for (const g of dupeGroups) {
    const { deleteId } = pickCanonical(g);
    deleteIdSet.add(deleteId);
    affectedStudentIds.add(g[0].student_id);
  }

  console.log(`\nAffected student_ids (from 348 groups): ${affectedStudentIds.size}`);

  // ── Surviving sessions for the 34 affected students ───────────────────────
  const survivingSessions = sessions.filter(s =>
    affectedStudentIds.has(s.student_id) &&
    !deleteIdSet.has(s.id) &&
    (s.status === 'completed' || s.status === 'no_show_student'),
  );

  const survNullDur  = survivingSessions.filter(s => s.duration_minutes === null || s.duration_minutes === undefined);
  const survZeroDur  = survivingSessions.filter(s => s.duration_minutes === 0);
  const survValidDur = survivingSessions.filter(s => s.duration_minutes > 0);

  console.log(`\nSurviving completed/no_show sessions for 34 affected students: ${survivingSessions.length}`);
  console.log(`  duration_minutes IS NULL : ${survNullDur.length}`);
  console.log(`  duration_minutes = 0    : ${survZeroDur.length}`);
  console.log(`  duration_minutes > 0    : ${survValidDur.length}`);

  // ── Per-student breakdown for affected students with null/0 ───────────────
  if (survNullDur.length > 0 || survZeroDur.length > 0) {
    console.log('\nPer-student surviving null/0 duration sessions:');
    for (const studentId of affectedStudentIds) {
      const surv = survivingSessions.filter(s => s.student_id === studentId);
      const bad  = surv.filter(s => !s.duration_minutes);
      if (bad.length === 0) continue;
      const { data: stu } = await supabase.from('students').select('name, used_hours').eq('id', studentId).maybeSingle();
      console.log(`  ${stu?.name ?? studentId}: ${bad.length}/${surv.length} surviving sessions have null/0 duration`);
      for (const s of bad.slice(0, 5)) {
        console.log(`    id=${s.id.slice(0,8)}… status=${s.status} duration_minutes=${s.duration_minutes} scheduled=${s.scheduled_at?.slice(0,16)}`);
      }
    }
  } else {
    console.log('\n✅ No null or zero duration_minutes in surviving sessions for affected students.');
  }

  // ── What does computeUsedHours do with null? ──────────────────────────────
  console.log('\nLogic in dedup-b-execute.ts for null duration:');
  console.log('  survivingMinutesByStudent.set(s.student_id, prev + (s.duration_minutes ?? 0))');
  console.log('  → null/undefined treated as 0 via ?? operator (adds nothing to sum)');
  console.log('  → zero treated as 0 (adds nothing to sum)');
  console.log('  In both cases: session IS included in the "survived" cohort but contributes 0 minutes.');
  console.log('  Risk: undercount if real sessions have null duration.');

  console.log('\n=== Audit complete ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });
