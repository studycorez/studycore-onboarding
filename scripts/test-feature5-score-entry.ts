/**
 * Feature 5 E2E test — Score Entry After Sessions
 * Run: npx ts-node --project tsconfig.json scripts/test-feature5-score-entry.ts
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Inline score submission logic (mirrors /api/sessions/[id]/score) ─────────
async function submitScore(sessionId: string, scores: {
  math_score?: number; reading_score?: number; writing_score?: number; total_score?: number;
}): Promise<{ ok: boolean; id?: string; error?: string; status: number }> {
  if (!scores.math_score && !scores.reading_score && !scores.writing_score && !scores.total_score) {
    return { ok: false, error: 'At least one score is required', status: 400 };
  }

  const { data: session } = await supabase.from('sessions').select('id, student_id').eq('id', sessionId).single();
  if (!session) return { ok: false, error: 'Session not found', status: 404 };

  const payload: Record<string, unknown> = {
    student_id: session.student_id,
    session_id: sessionId,
    recorded_at: new Date().toISOString(),
    ...scores,
  };

  const { data, error } = await supabase.from('student_progress').insert(payload).select('id').single();
  if (error) return { ok: false, error: error.message, status: 500 };

  if (scores.total_score) {
    await supabase.from('students').update({ current_score: scores.total_score }).eq('id', session.student_id);
  }

  return { ok: true, id: data.id, status: 200 };
}

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 5 Test — Score Entry After Sessions');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let studentId: string | null = null;
  let tutorId: string | null = null;
  let sessionId: string | null = null;
  let progressId: string | null = null;

  // ── Setup ────────────────────────────────────────────────────────────────
  try {
    const { data: s, error: sErr } = await supabase.from('students')
      .insert({ name: 'Score Test Student', email: 'scoretest@studycore.test', grade: 11, status: 'active', purchased_hours: 10, current_score: 1200, target_score: 1400 })
      .select('id').single();
    if (sErr) throw new Error(sErr.message);
    studentId = s!.id;

    const { data: t, error: tErr } = await supabase.from('tutors')
      .insert({ name: 'Score Test Tutor', email: 'scoretesttutor@studycore.test', hourly_rate: 25 })
      .select('id').single();
    if (tErr) throw new Error(tErr.message);
    tutorId = t!.id;

    const { data: sess, error: sessErr } = await supabase.from('sessions')
      .insert({ student_id: studentId, tutor_id: tutorId, scheduled_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), duration_minutes: 90, status: 'completed' })
      .select('id').single();
    if (sessErr) throw new Error(sessErr.message);
    sessionId = sess!.id;
    console.log(`  Setup: session=${sessionId?.slice(0, 8)}\n`);
  } catch (e: any) {
    fail('Setup test data', e.message);
    process.exit(1);
  }

  // ── Step 1: Reject empty scores ───────────────────────────────────────────
  console.log('── Step 1: Empty scores rejected');
  const r1 = await submitScore(sessionId!, {});
  if (r1.status === 400) pass('Empty scores rejected', 'status 400');
  else fail('Empty scores rejected', `status ${r1.status}`);

  // ── Step 2: Session not found returns 404 ────────────────────────────────
  console.log('\n── Step 2: Invalid session 404');
  const r2 = await submitScore('00000000-0000-0000-0000-000000000000', { total_score: 1300 });
  if (r2.status === 404) pass('Invalid session rejected', 'status 404');
  else fail('Invalid session rejected', `status ${r2.status}`);

  // ── Step 3: Submit partial scores (math + reading) ─────────────────────
  console.log('\n── Step 3: Submit partial scores (math + reading)');
  const r3 = await submitScore(sessionId!, { math_score: 650, reading_score: 620 });
  if (r3.ok) { progressId = r3.id!; pass('Partial scores submitted', `id=${r3.id?.slice(0, 8)}`); }
  else fail('Partial scores submitted', r3.error ?? '');

  // ── Step 4: Scores persisted in student_progress ────────────────────────
  console.log('\n── Step 4: Scores in student_progress');
  try {
    const { data } = await supabase.from('student_progress').select('*').eq('id', progressId!).single();
    if (data?.math_score === 650 && data?.reading_score === 620 && data?.session_id === sessionId) {
      pass('Scores in DB', `math=${data.math_score}, reading=${data.reading_score}`);
    } else {
      fail('Scores in DB', JSON.stringify(data));
    }
  } catch (e: any) { fail('Scores in DB', e.message); }

  // ── Step 5: Submit total score — updates student current_score ────────────
  console.log('\n── Step 5: Total score updates student.current_score');
  const r5 = await submitScore(sessionId!, { math_score: 680, reading_score: 640, total_score: 1320 });
  if (!r5.ok) { fail('Score with total', r5.error ?? ''); }
  else {
    const { data: student } = await supabase.from('students').select('current_score').eq('id', studentId!).single();
    if (student?.current_score === 1320) pass('Student current_score updated', `1200 → 1320`);
    else fail('Student current_score updated', `got ${student?.current_score}`);
  }

  // ── Step 6: Multiple scores logged for same session ──────────────────────
  console.log('\n── Step 6: Multiple scores per session allowed');
  const { data: allScores } = await supabase.from('student_progress').select('id').eq('session_id', sessionId!);
  if ((allScores?.length ?? 0) >= 2) pass('Multiple scores allowed', `${allScores!.length} entries`);
  else fail('Multiple scores', `only ${allScores?.length ?? 0} entries`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    await supabase.from('student_progress').delete().eq('session_id', sessionId!);
    if (sessionId) await supabase.from('sessions').delete().eq('id', sessionId);
    if (studentId) await supabase.from('students').delete().eq('id', studentId);
    if (tutorId)   await supabase.from('tutors').delete().eq('id', tutorId);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 5 PASS' : '  ⚠️  Feature 5 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
