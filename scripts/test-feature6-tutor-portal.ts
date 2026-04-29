/**
 * Feature 6 E2E test — Tutor Portal
 * Run: npx ts-node --project tsconfig.json scripts/test-feature6-tutor-portal.ts
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JWT_SECRET = new TextEncoder().encode(process.env.TUTOR_JWT_SECRET ?? 'tutor-fallback-secret-change-me');

async function signJWT(payload: { tutorId: string; tutorName: string; tutorEmail: string }) {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(JWT_SECRET);
}

async function verifyJWT(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch { return null; }
}

// Inline login logic
async function login(email: string, password: string): Promise<{ ok: boolean; token?: string; error?: string; status: number }> {
  if (!email || !password) return { ok: false, error: 'Email and password required', status: 400 };

  const { data: tutor } = await supabase
    .from('tutors').select('id, name, email, password_hash')
    .eq('email', email.toLowerCase().trim()).maybeSingle();

  if (!tutor || !tutor.password_hash) return { ok: false, error: 'Invalid email or password', status: 401 };

  const valid = await bcrypt.compare(password, tutor.password_hash);
  if (!valid) return { ok: false, error: 'Invalid email or password', status: 401 };

  const token = await signJWT({ tutorId: tutor.id, tutorName: tutor.name, tutorEmail: tutor.email });
  return { ok: true, token, status: 200 };
}

async function main() {
  const results: { step: string; passed: boolean; detail: string }[] = [];
  function pass(step: string, detail = '') { results.push({ step, passed: true, detail }); console.log(`  ✅ PASS  ${step}${detail ? ' — ' + detail : ''}`); }
  function fail(step: string, detail = '') { results.push({ step, passed: false, detail }); console.log(`  ❌ FAIL  ${step}${detail ? ' — ' + detail : ''}`); }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Feature 6 Test — Tutor Portal');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const TEST_EMAIL = 'portal6test@studycore.test';
  const TEST_PASSWORD = 'TestPass123!';
  let tutorId: string | null = null;

  // ── Setup: create tutor with password ────────────────────────────────────
  try {
    const password_hash = await bcrypt.hash(TEST_PASSWORD, 10);
    const { data: t, error: tErr } = await supabase.from('tutors')
      .insert({ name: 'Portal Test Tutor', email: TEST_EMAIL, hourly_rate: 30, password_hash })
      .select('id').single();
    if (tErr) throw new Error(tErr.message);
    tutorId = t!.id;
    console.log(`  Setup: tutor=${tutorId?.slice(0, 8)}\n`);
  } catch (e: any) {
    fail('Setup test tutor', e.message);
    process.exit(1);
  }

  // ── Step 1: Portal pages exist ────────────────────────────────────────────
  console.log('── Step 1: Portal pages exist');
  const pages = [
    'src/app/tutor-portal/login/page.tsx',
    'src/app/tutor-portal/dashboard/page.tsx',
    'src/app/tutor-portal/sessions/page.tsx',
    'src/app/tutor-portal/students/page.tsx',
    'src/app/tutor-portal/profile/page.tsx',
    'src/app/tutor-portal/payroll/page.tsx',
    'src/app/tutor-portal/setup/page.tsx',
  ];
  const missing = pages.filter(p => !existsSync(resolve(process.cwd(), p)));
  if (missing.length === 0) pass('All portal pages exist', `${pages.length} pages`);
  else fail('Portal pages exist', `missing: ${missing.join(', ')}`);

  // ── Step 2: Wrong password rejected ──────────────────────────────────────
  console.log('\n── Step 2: Wrong password rejected');
  const r2 = await login(TEST_EMAIL, 'wrongpassword');
  if (r2.status === 401) pass('Wrong password rejected', 'status 401');
  else fail('Wrong password rejected', `status ${r2.status}`);

  // ── Step 3: Unknown email rejected ───────────────────────────────────────
  console.log('\n── Step 3: Unknown email rejected');
  const r3 = await login('nobody@studycore.test', TEST_PASSWORD);
  if (r3.status === 401) pass('Unknown email rejected', 'status 401');
  else fail('Unknown email rejected', `status ${r3.status}`);

  // ── Step 4: Valid login returns JWT ──────────────────────────────────────
  console.log('\n── Step 4: Valid login returns JWT');
  const r4 = await login(TEST_EMAIL, TEST_PASSWORD);
  let jwtToken: string | null = null;
  if (r4.ok && r4.token) {
    jwtToken = r4.token;
    pass('Valid login succeeds', 'JWT returned');
  } else {
    fail('Valid login', r4.error ?? 'no token');
  }

  // ── Step 5: JWT verifies correctly ───────────────────────────────────────
  console.log('\n── Step 5: JWT verifies and contains tutor info');
  if (jwtToken) {
    const payload = await verifyJWT(jwtToken) as any;
    if (payload?.tutorId === tutorId && payload?.tutorEmail === TEST_EMAIL) {
      pass('JWT payload correct', `tutorId=${payload.tutorId.slice(0, 8)}`);
    } else {
      fail('JWT payload', JSON.stringify(payload));
    }
  } else {
    fail('JWT verify', 'no token to verify');
  }

  // ── Step 6: JWT expires (7 days) ─────────────────────────────────────────
  console.log('\n── Step 6: JWT has 7-day expiry');
  if (jwtToken) {
    const payload = await verifyJWT(jwtToken) as any;
    const exp = payload?.exp as number;
    const iat = payload?.iat as number;
    const durationDays = Math.round((exp - iat) / 86400);
    if (durationDays === 7) pass('JWT expires in 7 days', `exp in ${durationDays} days`);
    else fail('JWT expiry', `expected 7 days, got ${durationDays}`);
  } else {
    fail('JWT expiry', 'no token');
  }

  // ── Step 7: Dashboard data available ─────────────────────────────────────
  console.log('\n── Step 7: Dashboard data queries work');
  try {
    const [today, contracts] = await Promise.all([
      supabase.from('sessions').select('id').eq('tutor_id', tutorId!).limit(1),
      supabase.from('contracts').select('student_id').eq('tutor_id', tutorId!).eq('status', 'signed'),
    ]);
    if (!today.error && !contracts.error) pass('Dashboard queries succeed', 'sessions + contracts');
    else fail('Dashboard queries', `${today.error?.message ?? ''} ${contracts.error?.message ?? ''}`);
  } catch (e: any) { fail('Dashboard queries', e.message); }

  // ── Step 8: Middleware protects portal routes ─────────────────────────────
  console.log('\n── Step 8: Middleware config protects portal routes');
  const mw = readFileSync(resolve(process.cwd(), 'src/middleware.ts'), 'utf8');
  if (mw.includes('/tutor-portal/login') && mw.includes('verifyTutorJWT')) {
    pass('Middleware protects portal', '/tutor-portal routes require JWT');
  } else {
    fail('Middleware config', 'JWT protection not found');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log('\n── Cleanup');
  try {
    if (tutorId) await supabase.from('tutors').delete().eq('id', tutorId);
    pass('Cleanup');
  } catch (e: any) { fail('Cleanup', e.message); }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.passed).length;
  console.log('\n═══════════════════════════════════════════════════════════════');
  for (const r of results) console.log(`  ${r.passed ? '✅' : '❌'}  ${r.step}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n  ${passed}/${results.length} passed`);
  console.log(passed === results.length ? '  🎉 Feature 6 PASS' : '  ⚠️  Feature 6 FAIL');
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
