/**
 * Creates test student + parent accounts for portal preview.
 * Run: npx ts-node --project tsconfig.json scripts/setup-test-accounts.ts
 *
 * Safe to run multiple times — upserts by email.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { Resend } from 'resend';

config({ path: resolve(process.cwd(), '.env.local') });

const APP_URL = 'https://studycore-eight.vercel.app';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const resend = new Resend(process.env.RESEND_API_KEY);
if (!process.env.RESEND_FROM_EMAIL) throw new Error('RESEND_FROM_EMAIL is not set');
const FROM   = process.env.RESEND_FROM_EMAIL;

const secret = new TextEncoder().encode(
  process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me',
);

async function signParentJWT(parentEmail: string): Promise<string> {
  return new SignJWT({ parentEmail })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(secret);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  StudyCore — Test Account Setup');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 1. Upsert test student ───────────────────────────────────────────────
  console.log('── Step 1: Create / update test student');

  const passwordHash = await bcrypt.hash('StudyCore2024!', 10);

  // Check for existing student by email
  const { data: existing } = await supabase
    .from('students')
    .select('id')
    .eq('email', 'harshilch611@gmail.com')
    .maybeSingle();

  let studentId: string;

  if (existing) {
    const { error } = await supabase.from('students').update({
      name:                'Harshil Test',
      grade:               11,
      purchased_hours:     20,
      used_hours:          4,
      target_score:        1500,
      current_score:       1300,
      status:              'active',
      parent_email:        'harshilch611@gmail.com',
      parent_name:         'Harshil (Parent)',
      portal_password_hash: passwordHash,
      xp_points:           850,
      xp_level:            3,
      avatar_animal:       'owl',
      avatar_color:        '#1e2090',
      battle_cry:          'Aiming for 1500!',
      streak_weeks:        3,
      badges:              ['first_session', 'week_streak_3', 'score_improver'],
    }).eq('id', existing.id);

    if (error) throw new Error(`Update failed: ${error.message}`);
    studentId = existing.id;
    console.log(`  ✅ Updated existing student  id=${studentId}`);
  } else {
    const { data: inserted, error } = await supabase.from('students').insert({
      name:                'Harshil Test',
      email:               'harshilch611@gmail.com',
      grade:               11,
      purchased_hours:     20,
      used_hours:          4,
      target_score:        1500,
      current_score:       1300,
      status:              'active',
      parent_email:        'harshilch611@gmail.com',
      parent_name:         'Harshil (Parent)',
      portal_password_hash: passwordHash,
      xp_points:           850,
      xp_level:            3,
      avatar_animal:       'owl',
      avatar_color:        '#1e2090',
      battle_cry:          'Aiming for 1500!',
      streak_weeks:        3,
      badges:              ['first_session', 'week_streak_3', 'score_improver'],
    }).select('id').single();

    if (error || !inserted) throw new Error(`Insert failed: ${error?.message}`);
    studentId = inserted.id;
    console.log(`  ✅ Created new student  id=${studentId}`);
  }

  // ── 2. Seed XP events so the activity feed looks real ────────────────────
  console.log('\n── Step 2: Seed XP events');
  // Remove old test XP events first to avoid duplication
  await supabase.from('xp_events').delete().eq('student_id', studentId);

  const xpEvents = [
    { student_id: studentId, event_type: 'session_complete', points: 100, description: 'Completed first tutoring session', created_at: new Date(Date.now() - 21 * 86400000).toISOString() },
    { student_id: studentId, event_type: 'session_complete', points: 100, description: 'Completed session #2', created_at: new Date(Date.now() - 14 * 86400000).toISOString() },
    { student_id: studentId, event_type: 'badge_earned',    points: 200, description: 'Earned 3-week streak badge', created_at: new Date(Date.now() - 7  * 86400000).toISOString() },
    { student_id: studentId, event_type: 'score_update',    points: 150, description: 'Scored 1300 on practice test', created_at: new Date(Date.now() - 3  * 86400000).toISOString() },
    { student_id: studentId, event_type: 'session_complete', points: 100, description: 'Completed session this week', created_at: new Date(Date.now() - 1  * 86400000).toISOString() },
    { student_id: studentId, event_type: 'homework_done',   points: 50,  description: 'Submitted session notes', created_at: new Date(Date.now() - 1  * 86400000).toISOString() },
  ];
  const { error: xpErr } = await supabase.from('xp_events').insert(xpEvents);
  if (xpErr) console.log(`  ⚠️  XP events: ${xpErr.message} (table may not exist — non-fatal)`);
  else console.log(`  ✅ Seeded ${xpEvents.length} XP events`);

  // ── 3. Seed student progress scores ─────────────────────────────────────
  console.log('\n── Step 3: Seed progress scores');
  await supabase.from('student_progress').delete().eq('student_id', studentId);

  const progressRows = [
    { student_id: studentId, total_score: 1200, math_score: 640, reading_score: 560, recorded_at: new Date(Date.now() - 28 * 86400000).toISOString() },
    { student_id: studentId, total_score: 1250, math_score: 660, reading_score: 590, recorded_at: new Date(Date.now() - 14 * 86400000).toISOString() },
    { student_id: studentId, total_score: 1300, math_score: 700, reading_score: 600, recorded_at: new Date(Date.now() -  3 * 86400000).toISOString() },
  ];
  const { error: progErr } = await supabase.from('student_progress').insert(progressRows);
  if (progErr) console.log(`  ⚠️  Progress: ${progErr.message}`);
  else console.log(`  ✅ Seeded ${progressRows.length} progress records (1200 → 1250 → 1300)`);

  // ── 4. Verify parent link ────────────────────────────────────────────────
  console.log('\n── Step 4: Verify parent link');
  const { data: parentCheck } = await supabase
    .from('students')
    .select('parent_email, parent_name')
    .eq('id', studentId)
    .single();

  if (parentCheck?.parent_email === 'harshilch611@gmail.com') {
    console.log(`  ✅ Parent email linked: ${parentCheck.parent_email}`);
  } else {
    console.log(`  ❌ Parent email mismatch: ${parentCheck?.parent_email}`);
  }

  // ── 5. Generate parent magic link ────────────────────────────────────────
  console.log('\n── Step 5: Generate parent portal magic link');
  const token = await signParentJWT('harshilch611@gmail.com');
  const magicLink = `${APP_URL}/api/parent-portal/verify?token=${encodeURIComponent(token)}`;
  console.log(`  ✅ Magic link generated (valid 7 days)`);

  // ── 6. Send student portal setup email ───────────────────────────────────
  console.log('\n── Step 6: Send student portal setup email');
  const setupUrl = `${APP_URL}/student-portal/login`;
  const emailTo  = 'harshilch611@gmail.com';

  const setupHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08);">
    <div style="background:#1e2090;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">StudyCore</h1>
      <p style="color:#9ab0ff;margin:4px 0 0;font-size:13px;">Student Portal Access</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#374151;font-size:15px;line-height:1.6;">Hi Harshil,</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;">
        Your StudyCore student account is ready! You can log in to track your progress,
        view session notes, earn XP, and check your score history.
      </p>
      <div style="background:#f0f4ff;border:1px solid #c3d1ff;border-radius:6px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 4px;font-size:14px;color:#6b7280;font-weight:500;">Login URL</p>
        <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">${setupUrl}</p>
        <p style="margin:12px 0 4px;font-size:14px;color:#6b7280;font-weight:500;">Email</p>
        <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">harshilch611@gmail.com</p>
        <p style="margin:12px 0 4px;font-size:14px;color:#6b7280;font-weight:500;">Password</p>
        <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">StudyCore2024!</p>
      </div>
      <a href="${setupUrl}" style="display:inline-block;background:#1e2090;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;margin:8px 0;">
        Go to Student Portal →
      </a>
      <p style="color:#9ca3af;font-size:13px;margin:20px 0 0;">
        You can change your password after logging in via the Profile page.
      </p>
    </div>
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #f3f4f6;font-size:12px;color:#9ca3af;text-align:center;">
      © ${new Date().getFullYear()} StudyCore. All rights reserved.
    </div>
  </div>
</body></html>`;

  const emailResult = await resend.emails.send({
    from: FROM,
    to:   [emailTo],
    subject: 'StudyCore — Your Student Portal is Ready',
    html:  setupHtml,
  });

  if ((emailResult as any).error) {
    console.log(`  ⚠️  Email error: ${(emailResult as any).error.message}`);
  } else {
    console.log(`  ✅ Setup email sent to ${emailTo}`);
  }

  // ── 7. Print summary ─────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  ✅  Test accounts ready!\n');

  console.log('  STUDENT PORTAL');
  console.log('  ──────────────');
  console.log(`  URL:      ${APP_URL}/student-portal/login`);
  console.log(`  Email:    harshilch611@gmail.com`);
  console.log(`  Password: StudyCore2024!`);
  console.log(`  XP:       850 pts  |  Level 3  |  3-week streak`);
  console.log(`  Badges:   first_session, week_streak_3, score_improver`);
  console.log(`  Scores:   1200 → 1250 → 1300 (current)`);

  console.log('\n  PARENT PORTAL');
  console.log('  ─────────────');
  console.log(`  Magic link (valid 7 days — open directly):`);
  console.log(`\n  ${magicLink}\n`);
  console.log(`  Or login at: ${APP_URL}/parent-portal/login`);
  console.log(`  Email: harshilch611@gmail.com  (sends a new magic link)`);

  console.log('\n  STUDENT DB RECORD');
  console.log('  ─────────────────');
  console.log(`  student_id:  ${studentId}`);
  console.log(`  name:        Harshil Test`);
  console.log(`  grade:       11`);
  console.log(`  hours:       4 used / 20 purchased`);
  console.log(`  scores:      current=1300, target=1500`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
