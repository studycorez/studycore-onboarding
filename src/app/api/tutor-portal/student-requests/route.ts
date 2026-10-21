import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { postSlackNotification } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const { data, error } = await supabase
    .from('student_add_requests')
    .select('*')
    .eq('tutor_id', payload.tutorId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const body = await req.json().catch(() => ({}));
  const {
    student_name, parent_name, parent_email, parent_phone,
    grade, target_score, test_date, school, notes,
  } = body;

  // Validation
  if (!student_name || typeof student_name !== 'string' || student_name.trim().length < 2) {
    return NextResponse.json({ error: 'Student name is required (2+ characters)' }, { status: 400 });
  }

  if (parent_email && !EMAIL_REGEX.test(parent_email)) {
    return NextResponse.json({ error: 'Invalid parent email format' }, { status: 400 });
  }

  if (target_score != null && target_score !== '') {
    const score = parseInt(target_score);
    if (isNaN(score) || score < 400 || score > 1600) {
      return NextResponse.json({ error: 'Target score must be between 400 and 1600' }, { status: 400 });
    }
  }

  if (test_date && isNaN(Date.parse(test_date))) {
    return NextResponse.json({ error: 'Invalid test date' }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from('student_add_requests')
    .insert({
      tutor_id: payload.tutorId,
      student_name: student_name.trim(),
      parent_name: parent_name?.trim() || null,
      parent_email: parent_email?.trim().toLowerCase() || null,
      parent_phone: parent_phone?.trim() || null,
      grade: grade?.toString().trim() || null,
      target_score: target_score ? parseInt(target_score) : null,
      test_date: test_date || null,
      school: school?.trim() || null,
      notes: notes?.trim() || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Slack alert
  const slackLines = [
    `🎓 *New Student Add Request from ${payload.tutorName}*`,
    `• Student: ${student_name.trim()}`,
    parent_name   ? `• Parent: ${parent_name}` : null,
    parent_email  ? `• Email: ${parent_email}` : null,
    parent_phone  ? `• Phone: ${parent_phone}` : null,
    grade         ? `• Grade: ${grade}` : null,
    target_score  ? `• SAT Target: ${target_score}` : null,
    notes         ? `• Notes: ${notes}` : null,
    `Review at /admin/student-requests`,
  ].filter(Boolean).join('\n');

  postSlackNotification(slackLines).catch(() => {});

  return NextResponse.json({ success: true, request_id: row.id });
}
