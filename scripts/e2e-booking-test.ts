/**
 * End-to-end booking flow test.
 *
 * Steps:
 *  1. Create test student
 *  2. Create/upsert test tutor
 *  3. Create signed contract
 *  4. Book 4 recurring sessions (Mon + Wed × 2 weeks) with real Zoom meetings
 *  5. Send booking confirmation email to harshilch611@gmail.com
 *  6. Send student portal setup link
 *  7. Send 24hr reminder for first session
 *  8. Verify DB — all sessions have required fields
 *  9. Cleanup
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/e2e-booking-test.ts
 */
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend  = new Resend(process.env.RESEND_API_KEY);
// Use a verified domain address so Resend will deliver to any recipient.
// onboarding@resend.dev is the sandbox default and only allows sending to
// the account's own verified email — not suitable for real recipient tests.
const FROM = (() => {
  const configured = process.env.RESEND_FROM_EMAIL || '';
  return configured && configured !== 'onboarding@resend.dev'
    ? configured
    : 'noreply@studycore.net';
})();
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studycore-eight.vercel.app';

const TEST_EMAIL  = 'harshilch611@gmail.com';
const NAVY        = '#1e2090';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(step: string, detail = '') {
  console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`);
}
function fail(step: string, detail = '') {
  console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`);
}

function baseLayout(content: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);}
  .header{background:${NAVY};padding:24px 32px;}
  .header h1{color:#fff;margin:0;font-size:22px;font-weight:700;}
  .header p{color:#9ab0ff;margin:4px 0 0;font-size:13px;}
  .body{padding:32px;}
  .body h2{color:#111827;margin:0 0 16px;font-size:18px;}
  .body p{color:#374151;line-height:1.6;margin:0 0 12px;font-size:15px;}
  .info-box{background:#f0f4ff;border:1px solid #c3d1ff;border-radius:6px;padding:16px 20px;margin:20px 0;}
  .info-row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px;}
  .info-row .label{color:#6b7280;font-weight:500;}
  .info-row .value{color:#111827;font-weight:600;}
  .btn{display:inline-block;background:${NAVY};color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;margin:8px 0;}
  .footer{padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;}
</style></head><body><div class="wrap">${content}
<div class="footer">&copy; ${new Date().getFullYear()} StudyCore. E2E Test Email.</div></div></body></html>`;
}

function formatDt(iso: string) {
  return format(new Date(iso), "EEEE, MMMM d, yyyy 'at' h:mm a");
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

async function getZoomToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
    { method: 'POST', headers: { Authorization: `Basic ${creds}` } }
  );
  if (!res.ok) throw new Error(`Zoom token error: ${await res.text()}`);
  const d = await res.json();
  return d.access_token as string;
}

async function createZoomMeeting(token: string, params: {
  topic: string; startTime: string; durationMinutes: number;
}): Promise<{ id: string; join_url: string; start_url: string } | null> {
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: params.topic,
      type: 2,
      start_time: params.startTime,
      duration: params.durationMinutes,
      settings: { host_video: true, participant_video: true, waiting_room: true },
    }),
  });
  if (!res.ok) {
    console.error('  createZoomMeeting error:', await res.text());
    return null;
  }
  const d = await res.json();
  return { id: String(d.id), join_url: d.join_url, start_url: d.start_url };
}

async function deleteZoomMeeting(token: string, meetingId: string): Promise<void> {
  await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// Returns the next occurrence of a given weekday (0=Sun, 1=Mon ... 6=Sat) from today.
// If today is that day, returns next week's occurrence.
function nextWeekday(targetDow: number, fromDate: Date = new Date()): Date {
  const d = new Date(fromDate);
  d.setHours(0, 0, 0, 0);
  const diff = (targetDow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
  return d;
}

// Build 4 session timestamps: Mon + Wed for 2 consecutive weeks at 5pm EDT (21:00 UTC)
function buildScheduledAts(): string[] {
  const nextMon  = nextWeekday(1);           // Monday
  const nextWed  = nextWeekday(3, nextMon);  // Wednesday same week
  const mon2     = new Date(nextMon); mon2.setDate(mon2.getDate() + 7);
  const wed2     = new Date(nextWed); wed2.setDate(nextWed.getDate() + 7);
  return [nextMon, nextWed, mon2, wed2].map(d => {
    d.setUTCHours(21, 0, 0, 0); // 5 PM EDT = 21:00 UTC
    return d.toISOString();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(68)}`);
  console.log('  StudyCore — End-to-End Booking Flow Test');
  console.log(`  ${new Date().toLocaleString()}`);
  console.log(`${'═'.repeat(68)}\n`);

  let testStudentId: string | null = null;
  let testTutorId:   string | null = null;
  let contractId:    string | null = null;
  let sessionIds:    string[]      = [];
  let zoomIds:       string[]      = [];
  let zoomToken:     string | null = null;

  const results: { step: string; passed: boolean; detail: string }[] = [];

  function record(step: string, passed: boolean, detail = '') {
    results.push({ step, passed, detail });
    if (passed) pass(step, detail);
    else        fail(step, detail);
  }

  // ── Step 1: Create test student ──────────────────────────────────────────
  console.log('── Step 1: Create test student');
  try {
    // Remove any leftover test student first
    await supabase.from('students').delete().eq('email', TEST_EMAIL).eq('name', 'Test Student');

    const { data: student, error } = await supabase
      .from('students')
      .insert({
        name:            'Test Student',
        email:           TEST_EMAIL,
        grade:           11,
        purchased_hours: 20,
        target_score:    1400,
        current_score:   1200,
        status:          'active',
      })
      .select('id')
      .single();

    if (error || !student) throw new Error(error?.message ?? 'No data returned');
    testStudentId = student.id;
    record('Create test student', true, `id=${testStudentId}`);
  } catch (e: any) {
    record('Create test student', false, e.message);
  }

  // ── Step 2: Create/upsert test tutor ────────────────────────────────────
  console.log('\n── Step 2: Create/upsert test tutor');
  try {
    // Check if a tutor with this email already exists
    const { data: existing } = await supabase
      .from('tutors')
      .select('id')
      .eq('email', TEST_EMAIL)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('tutors')
        .update({ name: 'Test Tutor' })
        .eq('id', existing.id);
      if (error) throw new Error(error.message);
      testTutorId = existing.id;
      record('Create/upsert test tutor', true, `updated existing id=${testTutorId}`);
    } else {
      // Remove leftover test tutors
      await supabase.from('tutors').delete().eq('name', 'Test Tutor');

      const { data: tutor, error } = await supabase
        .from('tutors')
        .insert({ name: 'Test Tutor', email: TEST_EMAIL, hourly_rate: 0 })
        .select('id')
        .single();
      if (error || !tutor) throw new Error(error?.message ?? 'No data returned');
      testTutorId = tutor.id;
      record('Create/upsert test tutor', true, `created id=${testTutorId}`);
    }
  } catch (e: any) {
    record('Create/upsert test tutor', false, e.message);
  }

  // ── Step 3: Create signed contract ──────────────────────────────────────
  console.log('\n── Step 3: Create signed contract');
  if (!testStudentId || !testTutorId) {
    record('Create signed contract', false, 'skipped — student or tutor missing');
  } else {
    try {
      const { data: contract, error } = await supabase
        .from('contracts')
        .insert({
          student_id:  testStudentId,
          tutor_id:    testTutorId,
          status:      'signed',
          hourly_rate: 0,
        })
        .select('id')
        .single();
      if (error || !contract) throw new Error(error?.message ?? 'No data returned');
      contractId = contract.id;
      record('Create signed contract', true, `id=${contractId}`);
    } catch (e: any) {
      record('Create signed contract', false, e.message);
    }
  }

  // ── Step 4: Book recurring sessions via bulk-recurring logic ────────────
  console.log('\n── Step 4: Book 4 recurring sessions (Mon + Wed × 2 weeks, 5pm EDT, 90 min)');
  if (!testStudentId || !testTutorId || !contractId) {
    record('Book recurring sessions', false, 'skipped — prerequisites failed');
  } else {
    try {
      zoomToken = await getZoomToken();
      const scheduledAts = buildScheduledAts();
      console.log(`  Dates: ${scheduledAts.map(s => s.slice(0, 16)).join(', ')}`);

      let bookedCount = 0;
      for (const scheduledAt of scheduledAts) {
        const meeting = await createZoomMeeting(zoomToken, {
          topic:           `E2E Test — Test Student with Test Tutor`,
          startTime:       scheduledAt,
          durationMinutes: 90,
        });

        const { data: session, error } = await supabase
          .from('sessions')
          .insert({
            student_id:      testStudentId,
            tutor_id:        testTutorId,
            scheduled_at:    scheduledAt,
            duration_minutes: 90,
            payment_amount:  0,
            zoom_meeting_id: meeting?.id ?? null,
            zoom_join_url:   meeting?.join_url ?? null,
            zoom_host_url:   meeting?.start_url ?? null,
            status:          'scheduled',
            payment_status:  'pending',
          })
          .select('id')
          .single();

        if (error || !session) throw new Error(`Session insert failed: ${error?.message}`);
        sessionIds.push(session.id);
        if (meeting?.id) zoomIds.push(meeting.id);
        bookedCount++;
      }

      const allHaveZoom = zoomIds.length === scheduledAts.length;
      record(
        'Book recurring sessions',
        bookedCount === scheduledAts.length && allHaveZoom,
        `${bookedCount}/4 booked, ${zoomIds.length}/4 have Zoom meeting ID`,
      );
    } catch (e: any) {
      record('Book recurring sessions', false, e.message);
    }
  }

  // ── Step 5: Send booking confirmation email ──────────────────────────────
  console.log('\n── Step 5: Send booking confirmation email');
  if (sessionIds.length === 0) {
    record('Send booking confirmation email', false, 'skipped — no sessions created');
  } else {
    try {
      // Use first session's scheduled_at
      const { data: sess } = await supabase
        .from('sessions')
        .select('scheduled_at, zoom_join_url, duration_minutes')
        .eq('id', sessionIds[0])
        .single();

      const html = baseLayout(`
        <div class="header"><h1>StudyCore</h1><p>Session Confirmation — E2E Test</p></div>
        <div class="body">
          <h2>Your session is booked! 🎉</h2>
          <p>Hi Test Student, your SAT tutoring session has been confirmed.</p>
          <div class="info-box">
            <div class="info-row"><span class="label">Tutor</span><span class="value">Test Tutor</span></div>
            <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(sess!.scheduled_at)}</span></div>
            <div class="info-row"><span class="label">Duration</span><span class="value">90 minutes</span></div>
            <div class="info-row"><span class="label">Target Score</span><span class="value">1400</span></div>
          </div>
          ${sess?.zoom_join_url ? `<a href="${sess.zoom_join_url}" class="btn">Join Zoom Meeting</a>` : ''}
          <p><em>This is a test email from the StudyCore E2E test suite.</em></p>
        </div>`);

      const result = await resend.emails.send({
        from:    FROM,
        to:      [TEST_EMAIL],
        subject: `[E2E TEST] Session Confirmed: ${formatDt(sess!.scheduled_at)} with Test Tutor`,
        html,
      });

      if ((result as any).error) throw new Error((result as any).error.message);
      record('Send booking confirmation email', true, `emailId=${(result as any).data?.id}`);
    } catch (e: any) {
      record('Send booking confirmation email', false, e.message);
    }
  }

  // ── Step 6: Send student portal setup link ───────────────────────────────
  console.log('\n── Step 6: Send student portal setup link');
  if (!testStudentId) {
    record('Send student portal setup link', false, 'skipped — no student');
  } else {
    try {
      const token     = randomUUID();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      await supabase.from('students').update({
        portal_setup_token:            token,
        portal_setup_token_expires_at: expiresAt,
      }).eq('id', testStudentId);

      const setupUrl = `${APP_URL}/student-portal/setup?token=${token}`;
      const html = baseLayout(`
        <div class="header"><h1>StudyCore</h1><p>Student Portal Setup — E2E Test</p></div>
        <div class="body">
          <h2>Set up your StudyCore Student Portal</h2>
          <p>Hi Test Student, click the button below to set up your student portal.</p>
          <a href="${setupUrl}" class="btn">Set Up My Portal</a>
          <p>This link expires in 48 hours.</p>
          <p><em>This is a test email from the StudyCore E2E test suite.</em></p>
        </div>`);

      const result = await resend.emails.send({
        from:    FROM,
        to:      [TEST_EMAIL],
        subject: '[E2E TEST] Set up your StudyCore Student Portal',
        html,
      });

      if ((result as any).error) throw new Error((result as any).error.message);
      record('Send student portal setup link', true, `emailId=${(result as any).data?.id}`);
    } catch (e: any) {
      record('Send student portal setup link', false, e.message);
    }
  }

  // ── Step 7: Send 24hr reminder for first session ─────────────────────────
  console.log('\n── Step 7: Send 24hr reminder for first session');
  if (sessionIds.length === 0) {
    record('Send 24hr reminder', false, 'skipped — no sessions');
  } else {
    try {
      const { data: sess } = await supabase
        .from('sessions')
        .select('scheduled_at, zoom_join_url')
        .eq('id', sessionIds[0])
        .single();

      const html = baseLayout(`
        <div class="header"><h1>StudyCore</h1><p>Session Reminder — E2E Test</p></div>
        <div class="body">
          <h2>Your session is tomorrow</h2>
          <p>Hi Test Student, just a reminder that your session with Test Tutor is coming up!</p>
          <div class="info-box">
            <div class="info-row"><span class="label">Date &amp; Time</span><span class="value">${formatDt(sess!.scheduled_at)}</span></div>
            <div class="info-row"><span class="label">Tutor</span><span class="value">Test Tutor</span></div>
          </div>
          ${sess?.zoom_join_url ? `<a href="${sess.zoom_join_url}" class="btn">Join Zoom Meeting</a>` : ''}
          <p><em>This is a test email from the StudyCore E2E test suite.</em></p>
        </div>`);

      const result = await resend.emails.send({
        from:    FROM,
        to:      [TEST_EMAIL],
        subject: '[E2E TEST] Reminder: Session tomorrow with Test Tutor',
        html,
      });

      if ((result as any).error) throw new Error((result as any).error.message);
      record('Send 24hr reminder', true, `emailId=${(result as any).data?.id}`);
    } catch (e: any) {
      record('Send 24hr reminder', false, e.message);
    }
  }

  // ── Step 8: Verify DB ────────────────────────────────────────────────────
  console.log('\n── Step 8: Verify DB — all sessions have required fields');
  if (sessionIds.length === 0) {
    record('Verify DB sessions', false, 'skipped — no sessions created');
  } else {
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes, zoom_meeting_id, student_id, tutor_id, status')
        .in('id', sessionIds);

      if (error || !sessions) throw new Error(error?.message ?? 'No data');

      const missing: string[] = [];
      for (const s of sessions) {
        const fields: (keyof typeof s)[] = ['scheduled_at', 'duration_minutes', 'zoom_meeting_id', 'student_id', 'tutor_id'];
        for (const f of fields) {
          if (!s[f]) missing.push(`session ${s.id.slice(0, 8)} missing ${f}`);
        }
        if (s.status !== 'scheduled') missing.push(`session ${s.id.slice(0, 8)} status=${s.status}`);
      }

      console.log(`  Found ${sessions.length} sessions in DB:`);
      for (const s of sessions) {
        console.log(`    ${s.id.slice(0, 8)}  ${s.scheduled_at?.slice(0, 16)}  zoom=${s.zoom_meeting_id ?? 'NULL'}  dur=${s.duration_minutes}min`);
      }

      record(
        'Verify DB sessions',
        missing.length === 0,
        missing.length === 0
          ? `${sessions.length} sessions verified — all fields populated`
          : missing.join('; '),
      );
    } catch (e: any) {
      record('Verify DB sessions', false, e.message);
    }
  }

  // ── Step 9: Cleanup ──────────────────────────────────────────────────────
  console.log('\n── Step 9: Cleanup');
  let cleanupOk = true;
  try {
    // Delete Zoom meetings
    if (zoomToken && zoomIds.length > 0) {
      for (const zId of zoomIds) await deleteZoomMeeting(zoomToken, zId);
      console.log(`  → Deleted ${zoomIds.length} Zoom meeting(s)`);
    }

    // Delete sessions
    if (sessionIds.length > 0) {
      const { error } = await supabase.from('sessions').delete().in('id', sessionIds);
      if (error) throw new Error(`sessions: ${error.message}`);
      console.log(`  → Deleted ${sessionIds.length} session(s)`);
    }

    // Delete contract
    if (contractId) {
      const { error } = await supabase.from('contracts').delete().eq('id', contractId);
      if (error) throw new Error(`contract: ${error.message}`);
      console.log(`  → Deleted contract ${contractId.slice(0, 8)}`);
    }

    // Delete student (also removes student_emails, xp_events etc if any)
    if (testStudentId) {
      for (const t of ['xp_events', 'student_emails', 'student_progress', 'student_availability']) {
        await supabase.from(t as any).delete().eq('student_id', testStudentId);
      }
      const { error } = await supabase.from('students').delete().eq('id', testStudentId);
      if (error) throw new Error(`student: ${error.message}`);
      console.log(`  → Deleted test student ${testStudentId.slice(0, 8)}`);
    }

    // Delete tutor only if we created a brand new one (not if we updated existing)
    if (testTutorId) {
      const { data: tutor } = await supabase.from('tutors').select('name').eq('id', testTutorId).single();
      if (tutor?.name === 'Test Tutor') {
        // Double-check no other sessions reference this tutor before deleting
        const { count } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('tutor_id', testTutorId);
        if ((count ?? 0) === 0) {
          const { error } = await supabase.from('tutors').delete().eq('id', testTutorId);
          if (error) throw new Error(`tutor: ${error.message}`);
          console.log(`  → Deleted test tutor ${testTutorId.slice(0, 8)}`);
        } else {
          console.log(`  → Skipped tutor deletion — still has ${count} session(s) referencing it`);
        }
      }
    }

    record('Cleanup', true, 'all test data removed');
  } catch (e: any) {
    cleanupOk = false;
    record('Cleanup', false, e.message);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(68)}`);
  console.log('  Summary');
  console.log('  ' + '─'.repeat(64));
  const passed = results.filter(r => r.passed).length;
  const total  = results.length;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon}  ${r.step}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log('  ' + '─'.repeat(64));
  console.log(`  ${passed}/${total} steps passed`);
  if (passed === total) {
    console.log('  🎉 ALL TESTS PASSED');
  } else {
    console.log(`  ⚠️  ${total - passed} step(s) failed`);
  }
  console.log(`${'═'.repeat(68)}\n`);

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
