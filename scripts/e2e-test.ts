/**
 * StudyCore End-to-End Booking Test
 *
 * Tests the full booking flow against the live Vercel + Supabase environment:
 *   find/create student & tutor → ensure signed contract → call /api/sessions
 *   → verify Zoom meeting created → verify Resend reachable → log join URL → cleanup
 *
 * Run: npx tsx scripts/e2e-test.ts
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_KEY    = process.env.RESEND_API_KEY!;
const FROM          = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL       = process.env.NEXT_PUBLIC_APP_URL || 'https://studycore-eight.vercel.app';
const ADMIN_EMAIL   = process.env.ADMIN_EMAIL   || 'admin@studycore.com';
const ADMIN_PASS    = process.env.ADMIN_PASSWORD || 'StudyCore2024!';

const STUDENT_EMAIL = 'harshilch611@gmail.com';
const TUTOR_EMAIL   = 'info@studycore.net';

for (const [k, v] of Object.entries({ SUPABASE_URL, SERVICE_KEY, RESEND_KEY })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const resend = new Resend(RESEND_KEY);

// ── Test runner ─────────────────────────────────────────────────────────────

type Result = { name: string; passed: boolean; detail: string };
const results: Result[] = [];

function pass(name: string, detail = '') {
  results.push({ name, passed: true, detail });
  console.log(`  ✓ ${name}${detail ? `  — ${detail}` : ''}`);
}
function fail(name: string, detail = '') {
  results.push({ name, passed: false, detail });
  console.error(`  ✗ ${name}${detail ? `  — ${detail}` : ''}`);
}
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); pass(name); }
  catch (e: any) { fail(name, e?.message ?? String(e)); }
}

// ── Auth cookie builder ─────────────────────────────────────────────────────
// @supabase/ssr stores the session as chunked cookies:
//   sb-<ref>-auth-token       (single chunk if small enough)
//   sb-<ref>-auth-token.0/.1… (multiple chunks)
// Max Supabase cookie chunk size observed: 3180 chars.

function buildAuthCookies(projectRef: string, session: Record<string, unknown>): string {
  const CHUNK = 3180;
  const raw = JSON.stringify(session);
  const chunks: string[] = [];
  for (let i = 0; i < raw.length; i += CHUNK) chunks.push(raw.slice(i, i + CHUNK));
  const name = `sb-${projectRef}-auth-token`;
  if (chunks.length === 1) return `${name}=${encodeURIComponent(chunks[0])}`;
  return chunks.map((c, i) => `${name}.${i}=${encodeURIComponent(c)}`).join('; ');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(64));
  console.log('StudyCore E2E Booking Test');
  console.log(`Target: ${APP_URL}`);
  console.log(`Time:   ${new Date().toISOString()}`);
  console.log('═'.repeat(64));

  const created = { student: false, tutor: false, contract: false };
  let studentId = '';
  let tutorId   = '';
  let contractId = '';
  let sessionId  = '';

  // ── [1] Student ──────────────────────────────────────────────────────────
  console.log('\n[1] Student');
  await step(`Find or create student <${STUDENT_EMAIL}>`, async () => {
    const { data: existing } = await supabase
      .from('students').select('id').eq('email', STUDENT_EMAIL).maybeSingle();
    if (existing) {
      studentId = existing.id;
      return; // pre-existing — do not mark for cleanup
    }
    const { data, error } = await supabase
      .from('students')
      .insert({ name: 'Test Student', email: STUDENT_EMAIL })
      .select('id').single();
    if (error) throw error;
    studentId = data.id;
    created.student = true;
  });
  if (!studentId) { console.error('\nCannot continue without student.'); summarise(); process.exit(1); }
  console.log(`     student_id: ${studentId}`);

  // ── [2] Tutor ────────────────────────────────────────────────────────────
  console.log('\n[2] Tutor');
  await step(`Find or create tutor <${TUTOR_EMAIL}>`, async () => {
    const { data: existing } = await supabase
      .from('tutors').select('id').eq('email', TUTOR_EMAIL).maybeSingle();
    if (existing) {
      tutorId = existing.id;
      return;
    }
    const { data, error } = await supabase
      .from('tutors')
      .insert({ name: 'Test Tutor', email: TUTOR_EMAIL, subjects: ['SAT'], hourly_rate: 25 })
      .select('id').single();
    if (error) throw error;
    tutorId = data.id;
    created.tutor = true;
  });
  if (!tutorId) { console.error('\nCannot continue without tutor.'); summarise(); process.exit(1); }
  console.log(`     tutor_id: ${tutorId}`);

  // ── [3] Signed contract ──────────────────────────────────────────────────
  console.log('\n[3] Signed contract (required by /api/sessions)');
  await step('Find or create signed contract', async () => {
    const { data: existing } = await supabase
      .from('contracts')
      .select('id')
      .eq('tutor_id', tutorId)
      .eq('student_id', studentId)
      .eq('status', 'signed')
      .maybeSingle();
    if (existing) {
      contractId = existing.id;
      return;
    }
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        tutor_id: tutorId, student_id: studentId,
        hourly_rate: 25, status: 'signed',
        tutor_signature: 'E2E Test', signed_at: new Date().toISOString(),
      })
      .select('id').single();
    if (error) throw error;
    contractId = data.id;
    created.contract = true;
  });
  if (!contractId) { console.error('\nCannot continue without contract.'); summarise(); process.exit(1); }
  console.log(`     contract_id: ${contractId}`);

  // ── [4] Authenticate (get session cookie for admin→API call) ─────────────
  console.log('\n[4] Admin auth');
  let authCookie = '';
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  await step(`Sign in as ${ADMIN_EMAIL}`, async () => {
    // Use a browser-mode client so signInWithPassword populates session
    const browserClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await browserClient.auth.signInWithPassword({
      email: ADMIN_EMAIL, password: ADMIN_PASS,
    });
    if (error) throw error;
    if (!data.session) throw new Error('No session returned');
    authCookie = buildAuthCookies(projectRef, data.session as unknown as Record<string, unknown>);
  });
  if (!authCookie) { console.error('\nCannot continue without auth.'); summarise(); process.exit(1); }

  // ── [5] Create session via /api/sessions ─────────────────────────────────
  console.log('\n[5] Book session via API');
  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  let sessionData: any = null;
  await step(`POST ${APP_URL}/api/sessions`, async () => {
    const res = await fetch(`${APP_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: authCookie,
      },
      body: JSON.stringify({
        tutor_id: tutorId,
        student_id: studentId,
        scheduled_at: scheduledAt,
        duration_minutes: 60,
        create_zoom: true,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`${res.status}: ${body.error ?? JSON.stringify(body)}`);
    sessionData = body;
    sessionId = body.id;
  });
  if (!sessionId) { await cleanup(created, studentId, tutorId, contractId, ''); summarise(); process.exit(1); }
  console.log(`     session_id:   ${sessionId}`);
  console.log(`     scheduled_at: ${scheduledAt}`);

  // ── [6] Verify Zoom meeting created ──────────────────────────────────────
  console.log('\n[6] Zoom');
  await step('zoom_meeting_id is not null', async () => {
    if (!sessionData?.zoom_meeting_id) throw new Error('zoom_meeting_id is null — Zoom meeting was not created');
  });
  await step('zoom_join_url is present', async () => {
    if (!sessionData?.zoom_join_url) throw new Error('zoom_join_url is null');
  });
  console.log(`     zoom_meeting_id: ${sessionData?.zoom_meeting_id ?? '—'}`);
  console.log(`     zoom_join_url:   ${sessionData?.zoom_join_url ?? '—'}`);

  // ── [7] Verify Resend reachable ───────────────────────────────────────────
  // The API sends confirmation emails fire-and-forget (Promise.allSettled),
  // so we can't assert delivery from the session response. Instead, we call
  // Resend directly with the same key+from to confirm the integration works.
  console.log('\n[7] Email (Resend direct test)');
  await step(`Resend API key valid — send test email via ${FROM}`, async () => {
    const result = await resend.emails.send({
      from: FROM,
      to: ['delivered@resend.dev'], // Resend's sink address — always accepted
      subject: 'StudyCore E2E booking test',
      html: `<p>Session booked for ${scheduledAt}. Zoom: <a href="${sessionData?.zoom_join_url}">${sessionData?.zoom_join_url}</a></p>`,
    });
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.id) throw new Error('No message ID returned from Resend');
    pass('Email message ID returned', result.data.id);
  });

  // ── [8] Confirm session in DB ─────────────────────────────────────────────
  console.log('\n[8] DB verification');
  await step('Session row exists in Supabase', async () => {
    const { data, error } = await supabase
      .from('sessions').select('id, status, zoom_meeting_id, zoom_join_url').eq('id', sessionId).single();
    if (error) throw error;
    if (!data) throw new Error('Session not found in DB');
    if (!data.zoom_meeting_id) throw new Error('zoom_meeting_id null in DB');
  });

  // ── [9] Cleanup ───────────────────────────────────────────────────────────
  await cleanup(created, studentId, tutorId, contractId, sessionId);
  summarise();
  process.exit(results.some(r => !r.passed) ? 1 : 0);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function cleanup(
  created: { student: boolean; tutor: boolean; contract: boolean },
  studentId: string, tutorId: string, contractId: string, sessionId: string,
) {
  console.log('\n[cleanup]');
  if (sessionId) {
    const { error } = await supabase.from('sessions').delete().eq('id', sessionId);
    console.log(error ? `  ✗ session delete failed: ${error.message}` : '  ✓ test session deleted');
  }
  if (contractId && created.contract) {
    const { error } = await supabase.from('contracts').delete().eq('id', contractId);
    console.log(error ? `  ✗ contract delete failed: ${error.message}` : '  ✓ test contract deleted');
  }
  if (studentId && created.student) {
    const { error } = await supabase.from('students').delete().eq('id', studentId);
    console.log(error ? `  ✗ student delete failed: ${error.message}` : '  ✓ test student deleted');
  }
  if (tutorId && created.tutor) {
    const { error } = await supabase.from('tutors').delete().eq('id', tutorId);
    console.log(error ? `  ✗ tutor delete failed: ${error.message}` : '  ✓ test tutor deleted');
  }
  if (!sessionId && !created.contract && !created.student && !created.tutor) {
    console.log('  (no test data created — nothing to clean up)');
  }
}

function summarise() {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log('\n' + '═'.repeat(64));
  console.log('RESULTS');
  console.log('═'.repeat(64));
  for (const r of results) {
    console.log(`  ${r.passed ? '✓' : '✗'} ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  }
  console.log(`\n  Passed: ${passed} / ${results.length}   Failed: ${failed}`);
  console.log(failed === 0 ? '\n✅  All tests passed.' : `\n❌  ${failed} test(s) failed.`);
}

main().catch(err => { console.error('\nFATAL:', err); process.exit(1); });
