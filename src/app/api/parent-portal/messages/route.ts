import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';
import { postToSlack } from '@/lib/slack';
import { sendParentMessageForward } from '@/lib/email';
import { sendGHLSMS } from '@/lib/ghl';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

async function getParentStudentIds(supabase: ReturnType<typeof makeSupabase>, parentEmail: string): Promise<string[]> {
  const { data } = await supabase
    .from('students')
    .select('id')
    .ilike('parent_email', parentEmail);
  return (data ?? []).map((s: any) => s.id);
}

// GET /api/parent-portal/messages?student_id=...
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();
  const studentId = req.nextUrl.searchParams.get('student_id');
  const studentIds = await getParentStudentIds(supabase, payload.parentEmail);
  if (studentIds.length === 0) return NextResponse.json([]);

  const { data } = await supabase
    .from('messages')
    .select('id, student_id, sender_role, body, read_at, created_at')
    .in('student_id', studentId ? [studentId] : studentIds)
    .order('created_at');

  return NextResponse.json(data ?? []);
}

// POST /api/parent-portal/messages
export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { student_id, body } = await req.json();
  if (!student_id || !body?.trim()) {
    return NextResponse.json({ error: 'student_id and body required' }, { status: 400 });
  }

  const supabase = makeSupabase();

  // Verify student belongs to this parent
  const studentIds = await getParentStudentIds(supabase, payload.parentEmail);
  if (!studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data: msg } = await supabase
    .from('messages')
    .insert({ student_id, sender_role: 'parent', body: body.trim() })
    .select()
    .single();

  const { data: student } = await supabase
    .from('students')
    .select('name')
    .eq('id', student_id)
    .single();

  const studentName = student?.name ?? 'student';

  // Non-blocking: Slack + email forward + SMS confirmation
  Promise.allSettled([
    postToSlack(
      `💬 *New parent message* from ${payload.parentEmail} re: ${studentName}\n> ${body.trim().slice(0, 200)}`,
    ),
    sendParentMessageForward({
      parentEmail: payload.parentEmail,
      studentName,
      body: body.trim(),
    }),
    sendGHLSMS(
      payload.parentEmail,
      `Hi, we received your message and will respond within 24 hours. – StudyCore Support`,
    ),
  ]).catch(() => {});

  return NextResponse.json(msg);
}

// PATCH /api/parent-portal/messages — mark messages read
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { student_id } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const supabase = makeSupabase();
  const studentIds = await getParentStudentIds(supabase, payload.parentEmail);
  if (!studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('student_id', student_id)
    .eq('sender_role', 'admin')
    .is('read_at', null);

  return NextResponse.json({ ok: true });
}
