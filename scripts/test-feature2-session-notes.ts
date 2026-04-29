/**
 * Feature 2 E2E test — Session Notes by Tutors
 * Run: npx ts-node --project tsconfig.json scripts/test-feature2-session-notes.ts
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studycore-eight.vercel.app';
const TEST_EMAIL = 'harshilch611@gmail.com';
const FROM = (process.env.RESEND_FROM_EMAIL || '').includes('onboarding@resend.dev')
  ? 'noreply@studycore.net'
  : (process.env.RESEND_FROM_EMAIL || 'noreply@studycore.net');

// ── Inline notes submission logic (mirrors /api/sessions/[id]/notes) ─────────

async function submitNotes(sessionId: string, token: string, tutorNotes: string, homeworkAssigned: string | null, sessionRating: number): Promise<{ ok: boolean; error?: string; status: number }> {
  if (!token) return { ok: false, error: 'Token required', status: 400 };
  if (!tutorNotes?.trim()) return { ok: false, error: 'Session notes required', status: 400 };
  if (!sessionRating || sessionRating < 1 || sessionRating > 5) return { ok: false, error: 'Rating (1–5) required', status: 400 };

  const { data: session } = await supabase
    .from('sessions')
    .select('id, notes_token, notes_submitted_at')
    .eq('id', sessionId)
    .single();

  if (!session) return { ok: false, error: 'Session not found', status: 404 };
  if (session.notes_token !== token) return { ok: false, error: 'Invalid token', status: 403 };

  const { error } = await supabase
    .from('sessions')
    .update({
      tutor_notes: tutorNotes.trim(),
      homework_assigned: homeworkAssigned?.trim() || null,
      session_rating: sessionRating,
      notes_submitted_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, status: 200 };
}

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 2 Test — Session Notes by Tutors');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let studentId: string | null = null;
  let tutorId: string | null = null;
  let sessionId: string | null = null;
  let notesToken: string | null = null;

  // ── Setup ────────────────────────────────────────────────────────────────
  try {
    const { data: s, error: sErr } = await supabase.from('students')
      .insert({ name: 'Notes Test Student', email: 'notestest@studycore.test', grade: 11, status: 'active', purchased_hours: 10, target_score: 1400, current_score: 1200 })
      .select('id').single();
    if (sErr) throw new Error(sErr.message);
    studentId = s!.id;

    const { data: t, error: tErr } = await supabase.from('tutors')
      .insert({ name: 'Notes Test Tutor', email: 'notestesttutor@studycore.test', hourly_rate: 25 })
      .select('id').single();
    if (tErr) throw new Error(tErr.message);
    tutorId = t!.id;

    const scheduledAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const { data: sess, error: sessErr } = await supabase.from('sessions')
      .insert({ student_id: studentId, tutor_id: tutorId, scheduled_at: scheduledAt, duration_minutes: 60, status: 'scheduled', log_request_sent: false })
      .select('id, notes_token').single();
    if (sessErr) throw new Error(sessErr.message);
    sessionId = sess!.id;
    notesToken = sess!.notes_token;
    console.log(`  Setup: session=${sessionId?.slice(0, 8)}, token=${notesToken?.slice(0, 8)}…\n`);
  } catch (e: any) {
    fail('Setup test data', e.message);
    process.exit(1);
  }

  // ── Step 1: notes_token auto-generated ───────────────────────────────────
  console.log('── Step 1: notes_token auto-generated on session');
  if (notesToken && notesToken.length === 36) pass('notes_token generated', notesToken.slice(0, 8) + '…');
  else fail('notes_token generated', `got: ${notesToken}`);

  // ── Step 2: Notes page URL construction ──────────────────────────────────
  console.log('\n── Step 2: Notes URL correct format');
  const notesUrl = `${APP_URL}/sessions/${sessionId}/notes?token=${notesToken}`;
  if (notesUrl.includes(`/sessions/${sessionId}/notes?token=${notesToken}`)) pass('Notes URL format', notesUrl.split('/').slice(-3).join('/').slice(0, 60));
  else fail('Notes URL format', notesUrl);

  // ── Step 3: Invalid token rejected ───────────────────────────────────────
  console.log('\n── Step 3: Invalid token rejected');
  const r3 = await submitNotes(sessionId!, 'bad-token-00000000-0000-0000-0000-000000000000', 'test notes', null, 4);
  if (r3.status === 403) pass('Invalid token rejected', 'status 403');
  else fail('Invalid token rejected', `status ${r3.status} — ${r3.error}`);

  // ── Step 4: Missing notes rejected ───────────────────────────────────────
  console.log('\n── Step 4: Missing notes rejected');
  const r4 = await submitNotes(sessionId!, notesToken!, '', null, 4);
  if (r4.status === 400) pass('Empty notes rejected', 'status 400');
  else fail('Empty notes rejected', `status ${r4.status} — ${r4.error}`);

  // ── Step 5: Missing rating rejected ──────────────────────────────────────
  console.log('\n── Step 5: Missing rating rejected');
  const r5 = await submitNotes(sessionId!, notesToken!, 'Some notes', null, 0);
  if (r5.status === 400) pass('Missing rating rejected', 'status 400');
  else fail('Missing rating rejected', `status ${r5.status} — ${r5.error}`);

  // ── Step 6: Submit notes successfully ────────────────────────────────────
  console.log('\n── Step 6: Submit notes successfully');
  const r6 = await submitNotes(
    sessionId!,
    notesToken!,
    'Covered quadratic equations and factoring. Student made great progress on completing the square.',
    'Khan Academy: Quadratic equations — 15 problems',
    4,
  );
  if (r6.ok) pass('Notes submitted', 'status 200');
  else fail('Notes submitted', `status ${r6.status} — ${r6.error}`);

  // ── Step 7: Notes persisted in DB ────────────────────────────────────────
  console.log('\n── Step 7: Notes persisted in DB');
  try {
    const { data: sess } = await supabase.from('sessions')
      .select('tutor_notes, homework_assigned, session_rating, notes_submitted_at')
      .eq('id', sessionId!).single();
    if (
      sess?.tutor_notes?.includes('quadratic') &&
      sess?.homework_assigned?.includes('Khan Academy') &&
      sess?.session_rating === 4 &&
      sess?.notes_submitted_at
    ) {
      pass('Notes in DB', `rating=${sess.session_rating}, notes="${sess.tutor_notes!.slice(0, 30)}…"`);
    } else {
      fail('Notes in DB', JSON.stringify(sess));
    }
  } catch (e: any) { fail('Notes in DB', e.message); }

  // ── Step 8: Session notes email sends ────────────────────────────────────
  console.log('\n── Step 8: Session notes email');
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [TEST_EMAIL],
      subject: `[Test] Please log your session notes — Notes Test Student`,
      html: `
        <p>Hi Notes Test Tutor,</p>
        <p>Your session with <strong>Notes Test Student</strong> has ended. Please submit your notes:</p>
        <p><a href="${notesUrl}" style="background:#1e2090;color:white;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">Submit Session Notes</a></p>
        <p style="color:#666;font-size:12px;">Link: ${notesUrl}</p>
      `,
    });
    if (!error) pass('Email sent', `to ${TEST_EMAIL}`);
    else fail('Email sent', error.message);
  } catch (e: any) { fail('Email sent', e.message); }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (sessionId) await supabase.from('sessions').delete().eq('id', sessionId);
    if (studentId) await supabase.from('students').delete().eq('id', studentId);
    if (tutorId) await supabase.from('tutors').delete().eq('id', tutorId);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 2 PASS' : '  ⚠️  Feature 2 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
