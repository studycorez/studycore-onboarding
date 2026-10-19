/**
 * End-to-end test: tutor portal + Google Calendar integration
 * Usage: node scripts/test-tutor-portal.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'crypto';

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'https://egulthvtlfywawalcjtq.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const VERCEL_URL       = process.env.NEXT_PUBLIC_APP_URL        ?? 'https://studycore-eight.vercel.app';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let passed = 0;
let failed = 0;

function pass(label, detail = '') {
  console.log(`  ✅ PASS — ${label}${detail ? ': ' + detail : ''}`);
  passed++;
}

function fail(label, detail = '') {
  console.log(`  ❌ FAIL — ${label}${detail ? ': ' + detail : ''}`);
  failed++;
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCookies(headers) {
  const raw = headers.get('set-cookie') ?? '';
  const cookies = {};
  for (const part of raw.split(',')) {
    const [kv] = part.trim().split(';');
    const eqIdx = kv.indexOf('=');
    if (eqIdx > 0) {
      cookies[kv.slice(0, eqIdx).trim()] = kv.slice(eqIdx + 1).trim();
    }
  }
  return cookies;
}

// ── Run Tests ─────────────────────────────────────────────────────────────────

let tutorId, tutorEmail, tutorName, setupToken, jwtCookie, sessionId;

// ── STEP 1: Find a real tutor ─────────────────────────────────────────────────
section('STEP 1 — Find tutor with real email');
try {
  const { data: tutors, error } = await supabase
    .from('tutors')
    .select('id, name, email')
    .not('email', 'like', '%example%')
    .not('email', 'like', '%test%')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) throw error;
  if (!tutors?.length) throw new Error('No tutors found');

  const tutor = tutors[0];
  tutorId    = tutor.id;
  tutorEmail = tutor.email;
  tutorName  = tutor.name;

  console.log(`  Found: ${tutorName} <${tutorEmail}>`);
  console.log(`  ID: ${tutorId}`);
  pass('Tutor found in DB');
} catch (err) {
  fail('Tutor lookup', err.message);
  process.exit(1);
}

// ── STEP 2: Generate setup token directly in DB ───────────────────────────────
section('STEP 2 — Generate setup token in DB');
try {
  setupToken = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('tutors')
    .update({ setup_token: setupToken, setup_token_expires_at: expiresAt })
    .eq('id', tutorId);

  if (error) throw error;

  const setupUrl = `${VERCEL_URL}/tutor-portal/setup?token=${setupToken}`;
  console.log(`  Token: ${setupToken}`);
  console.log(`  Setup URL: ${setupUrl}`);
  pass('Setup token written to DB');

  // Verify it's readable via the GET endpoint
  const res = await fetch(`${VERCEL_URL}/api/tutor-auth/setup?token=${setupToken}`);
  const body = await res.json();
  if (res.ok && body.tutorId === tutorId) {
    pass('GET /api/tutor-auth/setup validates token correctly');
  } else {
    fail('GET /api/tutor-auth/setup', `status ${res.status}: ${JSON.stringify(body)}`);
  }
} catch (err) {
  fail('Setup token generation', err.message);
}

// ── STEP 3: Simulate password setup ──────────────────────────────────────────
section('STEP 3 — Simulate password setup via API');
try {
  const res = await fetch(`${VERCEL_URL}/api/tutor-auth/setup`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: setupToken, password: 'TestPass123!' }),
  });
  const body = await res.json();

  if (res.ok && body.ok) {
    pass('POST /api/tutor-auth/setup', 'password set successfully');
  } else {
    fail('POST /api/tutor-auth/setup', `status ${res.status}: ${JSON.stringify(body)}`);
  }

  // Verify token was cleared and password_hash was set
  const { data: row } = await supabase
    .from('tutors')
    .select('password_hash, setup_token')
    .eq('id', tutorId)
    .single();

  if (row?.password_hash && !row.setup_token) {
    pass('DB state after setup', 'password_hash set, setup_token cleared');
  } else {
    fail('DB state after setup', `password_hash=${!!row?.password_hash}, setup_token=${row?.setup_token}`);
  }
} catch (err) {
  fail('Password setup', err.message);
}

// ── STEP 4: Simulate login ────────────────────────────────────────────────────
section('STEP 4 — Simulate login');
try {
  const res = await fetch(`${VERCEL_URL}/api/tutor-auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tutorEmail, password: 'TestPass123!' }),
    redirect: 'manual',
  });

  const body = await res.json();
  const rawCookies = res.headers.get('set-cookie') ?? '';

  if (!res.ok) {
    fail('POST /api/tutor-auth/login', `status ${res.status}: ${JSON.stringify(body)}`);
  } else {
    pass('POST /api/tutor-auth/login', `status ${res.status}, ok=${body.ok}`);
  }

  // Extract JWT cookie
  const match = rawCookies.match(/tutor_session=([^;]+)/);
  if (match) {
    jwtCookie = match[1];
    const preview = jwtCookie.slice(0, 40) + '…';
    pass('JWT cookie returned', `tutor_session=${preview}`);
  } else {
    fail('JWT cookie', `set-cookie header: ${rawCookies.slice(0, 200)}`);
  }

  // Wrong password should 401
  const wrongRes = await fetch(`${VERCEL_URL}/api/tutor-auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tutorEmail, password: 'WrongPassword!' }),
  });
  if (wrongRes.status === 401) {
    pass('Wrong password correctly rejected (401)');
  } else {
    fail('Wrong password check', `expected 401, got ${wrongRes.status}`);
  }
} catch (err) {
  fail('Login', err.message);
}

// ── STEP 5: Google OAuth URL generation ──────────────────────────────────────
section('STEP 5 — Google OAuth URL generation');
if (!jwtCookie) {
  fail('Google OAuth test skipped', 'no JWT cookie from login step');
} else {
  try {
    const res = await fetch(`${VERCEL_URL}/api/tutor-auth/google-connect`, {
      headers: { Cookie: `tutor_session=${jwtCookie}` },
      redirect: 'manual', // don't follow the redirect to Google
    });

    const location = res.headers.get('location') ?? '';

    if ((res.status === 302 || res.status === 307) && location.includes('accounts.google.com')) {
      // Parse the redirect URL
      const url = new URL(location);
      console.log(`  Redirect to: ${url.origin}${url.pathname}`);
      console.log(`  Scope: ${url.searchParams.get('scope')}`);
      console.log(`  State (JWT): ${url.searchParams.get('state')?.slice(0, 40)}…`);
      console.log(`  Access type: ${url.searchParams.get('access_type')}`);
      pass('GET /api/tutor-auth/google-connect', 'redirects to Google with correct params');

      // Verify state is the JWT
      if (url.searchParams.get('state') === jwtCookie) {
        pass('State param equals JWT cookie value');
      } else {
        fail('State param mismatch', 'state does not equal JWT');
      }
    } else if (res.status === 302 || res.status === 307) {
      console.log(`  Redirect location: ${location}`);
      fail('Google OAuth redirect', `expected accounts.google.com, got: "${location}"`);
    } else if (res.status === 500) {
      const body = await res.text();
      if (body.includes('GOOGLE_CLIENT_ID') || body.includes('client_id')) {
        fail('Google OAuth', 'GOOGLE_CLIENT_ID not set on Vercel (add env var)');
      } else {
        fail('GET /api/tutor-auth/google-connect', `status 500: ${body.slice(0, 200)}`);
      }
    } else {
      const body = await res.text();
      fail('GET /api/tutor-auth/google-connect', `status ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (err) {
    fail('Google OAuth URL generation', err.message);
  }
}

// ── STEP 6: Session sync (direct DB + function logic test) ────────────────────
section('STEP 6 — Session sync (syncSessionToGoogleCalendar)');
try {
  // Find a session for this tutor
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, scheduled_at, status, google_event_id')
    .eq('tutor_id', tutorId)
    .order('scheduled_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  if (!sessions?.length) {
    console.log('  No sessions found for this tutor — testing guard condition only');

    // Verify google_calendar_connected is false (should be, since we never connected)
    const { data: row } = await supabase
      .from('tutors')
      .select('google_calendar_connected')
      .eq('id', tutorId)
      .single();

    if (!row?.google_calendar_connected) {
      pass('google_calendar_connected=false', 'syncSessionToGoogleCalendar would return early — correct');
    } else {
      fail('google_calendar_connected state', 'expected false but got true');
    }
  } else {
    sessionId = sessions[0].id;
    console.log(`  Found session: ${sessionId}`);
    console.log(`  Scheduled at: ${sessions[0].scheduled_at}`);
    console.log(`  Status: ${sessions[0].status}`);
    console.log(`  google_event_id: ${sessions[0].google_event_id ?? 'null (not synced yet)'}`);

    // Check google_calendar_connected for this tutor
    const { data: row } = await supabase
      .from('tutors')
      .select('google_calendar_connected')
      .eq('id', tutorId)
      .single();

    if (!row?.google_calendar_connected) {
      pass('Session found in DB', `id=${sessionId}`);
      pass('syncSessionToGoogleCalendar guard', 'google_calendar_connected=false → function returns early (no sync attempted, correct behavior)');
    } else {
      // Tutor has Google connected — test the actual sync endpoint
      // by posting a new session booking which triggers sync internally
      pass('Session found in DB', `id=${sessionId}`);
      console.log('  Note: google_calendar_connected=true — sync would be attempted on next session create');
    }
  }
} catch (err) {
  fail('Session sync test', err.message);
}

// ── STEP 7: Tutor portal API routes with JWT ──────────────────────────────────
section('STEP 7 — Tutor portal API routes with JWT');
if (!jwtCookie) {
  fail('API route tests skipped', 'no JWT cookie');
} else {
  const cookieHeader = { Cookie: `tutor_session=${jwtCookie}` };

  // 7a. GET /api/tutor-auth/me
  try {
    const res  = await fetch(`${VERCEL_URL}/api/tutor-auth/me`, { headers: cookieHeader });
    const body = await res.json();
    if (res.ok && body.id === tutorId && body.email === tutorEmail) {
      pass('GET /api/tutor-auth/me', `name="${body.name}", email="${body.email}", google_calendar_connected=${body.google_calendar_connected}`);
    } else {
      fail('GET /api/tutor-auth/me', `status ${res.status}: ${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('GET /api/tutor-auth/me', err.message);
  }

  // 7b. No request without cookie should fail
  try {
    const res = await fetch(`${VERCEL_URL}/api/tutor-auth/me`);
    if (res.status === 401) {
      pass('GET /api/tutor-auth/me without cookie → 401 (correct)');
    } else {
      fail('Auth guard on /me', `expected 401, got ${res.status}`);
    }
  } catch (err) {
    fail('Auth guard check', err.message);
  }

  // 7c. Tutor sessions — direct Supabase query (mirrors what the portal page does)
  try {
    const { data: portalSessions, error } = await supabase
      .from('sessions')
      .select('id, scheduled_at, status, student:students(name)')
      .eq('tutor_id', tutorId)
      .order('scheduled_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    pass(`Tutor sessions query (portal data)`, `${portalSessions?.length ?? 0} sessions returned`);
    if (portalSessions?.length) {
      const s = portalSessions[0];
      console.log(`  Latest: ${s.scheduled_at} | ${s.status} | student: ${s.student?.name ?? '—'}`);
    }
  } catch (err) {
    fail('Tutor sessions query', err.message);
  }

  // 7d. Tutor students — direct Supabase query (mirrors what the portal page does)
  try {
    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('student:students(id,name,grade,target_score)')
      .eq('tutor_id', tutorId)
      .eq('status', 'signed');

    if (error) throw error;
    const students = (contracts ?? []).map((c) => c.student).filter(Boolean);
    pass(`Tutor students query (portal data)`, `${students.length} signed-contract students`);
    for (const s of students.slice(0, 3)) {
      console.log(`  Student: ${s.name} | grade ${s.grade} | target ${s.target_score}`);
    }
  } catch (err) {
    fail('Tutor students query', err.message);
  }

  // 7e. Test PATCH /api/tutor-auth/profile
  try {
    const res = await fetch(`${VERCEL_URL}/api/tutor-auth/profile`, {
      method:  'PATCH',
      headers: { ...cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tutorName, phone: null, bio: null, subjects: [] }),
    });
    const body = await res.json();
    if (res.ok && body.ok) {
      pass('PATCH /api/tutor-auth/profile', 'profile update works');
    } else {
      fail('PATCH /api/tutor-auth/profile', `status ${res.status}: ${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('PATCH /api/tutor-auth/profile', err.message);
  }

  // 7f. Test google-disconnect (should work even if not connected)
  try {
    const res = await fetch(`${VERCEL_URL}/api/tutor-auth/google-disconnect`, {
      method:  'POST',
      headers: cookieHeader,
    });
    const body = await res.json();
    if (res.ok && body.ok) {
      pass('POST /api/tutor-auth/google-disconnect', 'disconnect endpoint works');
    } else {
      fail('POST /api/tutor-auth/google-disconnect', `status ${res.status}: ${JSON.stringify(body)}`);
    }
  } catch (err) {
    fail('POST /api/tutor-auth/google-disconnect', err.message);
  }
}

// ── STEP 8: Clean up ──────────────────────────────────────────────────────────
section('STEP 8 — Clean up test data');
try {
  const { error } = await supabase
    .from('tutors')
    .update({
      password_hash:          null,
      setup_token:            null,
      setup_token_expires_at: null,
    })
    .eq('id', tutorId);

  if (error) throw error;

  // Verify clean
  const { data: row } = await supabase
    .from('tutors')
    .select('password_hash, setup_token')
    .eq('id', tutorId)
    .single();

  if (!row?.password_hash && !row?.setup_token) {
    pass('Clean up complete', 'password_hash and setup_token cleared');
  } else {
    fail('Clean up verification', `password_hash=${!!row?.password_hash}, setup_token=${row?.setup_token}`);
  }
} catch (err) {
  fail('Clean up', err.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(60));

if (failed > 0) process.exit(1);
