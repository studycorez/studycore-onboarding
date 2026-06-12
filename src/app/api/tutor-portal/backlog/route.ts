import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

// ── GET: list this tutor's proposals ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const { data: tutorRow } = await supabase
    .from('tutors')
    .select('timezone')
    .eq('id', payload.tutorId)
    .single();
  const tutorTz = tutorRow?.timezone ?? 'America/Los_Angeles';

  const { data, error } = await supabase
    .from('session_proposals')
    .select('id, student_id, scheduled_at, duration_minutes, what_covered, status, admin_notes, created_at, reviewed_at, created_session_id, student:students(name)')
    .eq('tutor_id', payload.tutorId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const proposals = (data ?? []).map((p: any) => ({
    id: p.id,
    student_id: p.student_id,
    student_name: p.student?.name ?? '',
    scheduled_at: p.scheduled_at,
    duration_minutes: p.duration_minutes,
    what_covered: p.what_covered,
    status: p.status,
    admin_notes: p.admin_notes,
    created_at: p.created_at,
    reviewed_at: p.reviewed_at,
    created_session_id: p.created_session_id,
  }));

  return NextResponse.json({ proposals, tutorTz });
}

// ── POST: submit a new proposal ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();
  const body = await req.json().catch(() => ({}));

  const { student_id, scheduled_at, duration_minutes, what_covered, tutor_notes } = body;

  // 1. Required fields
  if (!student_id || !scheduled_at || !duration_minutes) {
    return NextResponse.json({ error: 'student_id, scheduled_at, and duration_minutes are required' }, { status: 400 });
  }

  // 2. Valid date
  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: 'scheduled_at must be a valid date' }, { status: 400 });
  }

  const now = Date.now();

  // 3. Must be in the past
  if (scheduledDate.getTime() > now) {
    return NextResponse.json({ error: 'scheduled_at must be in the past (you cannot propose a future session)' }, { status: 400 });
  }

  // 4. Within last 30 days
  if (now - scheduledDate.getTime() > THIRTY_DAYS_MS) {
    return NextResponse.json({ error: 'scheduled_at must be within the last 30 days' }, { status: 400 });
  }

  // 5. Duration range
  const dur = Number(duration_minutes);
  if (!Number.isFinite(dur) || dur < 15 || dur > 240) {
    return NextResponse.json({ error: 'duration_minutes must be between 15 and 240' }, { status: 400 });
  }

  // 6. Tutor must have a signed contract with this student
  // Use .limit(1) instead of .maybeSingle() — multiple signed contracts
  // can exist for the same tutor+student pair (re-signed, old+new, etc.)
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id')
    .eq('tutor_id', payload.tutorId)
    .eq('student_id', student_id)
    .eq('status', 'signed')
    .limit(1);

  if (!contracts || contracts.length === 0) {
    return NextResponse.json({ error: 'You are not assigned to this student.' }, { status: 403 });
  }

  // 7. Duplicate session detection (within 30 minutes of scheduled_at)
  const windowStart = new Date(scheduledDate.getTime() - THIRTY_MINUTES_MS).toISOString();
  const windowEnd = new Date(scheduledDate.getTime() + THIRTY_MINUTES_MS).toISOString();

  const { data: existingSession } = await supabase
    .from('sessions')
    .select('id')
    .eq('tutor_id', payload.tutorId)
    .eq('student_id', student_id)
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .limit(1)
    .maybeSingle();

  if (existingSession) {
    return NextResponse.json({
      error: 'A session already exists at that time. Submit a session report on the existing session instead.',
    }, { status: 409 });
  }

  // 8. Duplicate proposal detection (pending, within 30 minutes)
  const { data: existingProposal } = await supabase
    .from('session_proposals')
    .select('id')
    .eq('tutor_id', payload.tutorId)
    .eq('student_id', student_id)
    .eq('status', 'pending')
    .gte('scheduled_at', windowStart)
    .lte('scheduled_at', windowEnd)
    .limit(1)
    .maybeSingle();

  if (existingProposal) {
    return NextResponse.json({
      error: 'You already have a pending proposal at that time.',
    }, { status: 409 });
  }

  // Insert proposal
  const { data: proposal, error: insertErr } = await supabase
    .from('session_proposals')
    .insert({
      tutor_id: payload.tutorId,
      student_id,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: dur,
      what_covered: what_covered?.trim() || null,
      tutor_notes: tutor_notes?.trim() || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !proposal) {
    return NextResponse.json({ error: insertErr?.message ?? 'Failed to create proposal' }, { status: 500 });
  }

  // Slack notification (fire-and-forget)
  try {
    const [{ data: tutorRow }, { data: studentRow }] = await Promise.all([
      supabase.from('tutors').select('name').eq('id', payload.tutorId).single(),
      supabase.from('students').select('name').eq('id', student_id).single(),
    ]);
    const tutorName = tutorRow?.name ?? 'Unknown tutor';
    const studentName = studentRow?.name ?? 'Unknown student';
    const dateStr = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(scheduledDate);
    const covered = what_covered?.trim() ? ` — "${what_covered.trim().slice(0, 200)}"` : '';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';

    postToSlack(
      `📋 *Backlog proposal* from *${tutorName}*\n` +
      `Student: ${studentName} · ${dateStr} · ${dur} min${covered}\n` +
      `<${appUrl}/admin/session-proposals|Review in admin>`
    ).catch(err => console.error('[backlog] Slack notification failed:', err));
  } catch (slackErr) {
    console.error('[backlog] Slack notification error:', slackErr);
  }

  return NextResponse.json({ ok: true, proposalId: proposal.id });
}
