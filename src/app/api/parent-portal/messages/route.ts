import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';
import { postToSlack } from '@/lib/slack';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getParentStudentIds(parentEmail: string): Promise<string[]> {
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

  const studentId = req.nextUrl.searchParams.get('student_id');
  const studentIds = await getParentStudentIds(payload.parentEmail);
  if (studentIds.length === 0) return NextResponse.json([]);

  let q = supabase
    .from('messages')
    .select('id, student_id, sender_role, body, read_at, created_at')
    .in('student_id', studentId ? [studentId] : studentIds)
    .order('created_at');

  const { data } = await q;
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

  // Verify student belongs to this parent
  const studentIds = await getParentStudentIds(payload.parentEmail);
  if (!studentIds.includes(student_id)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { data: msg } = await supabase
    .from('messages')
    .insert({ student_id, sender_role: 'parent', body: body.trim() })
    .select()
    .single();

  // Slack notification
  const { data: student } = await supabase
    .from('students')
    .select('name')
    .eq('id', student_id)
    .single();

  await postToSlack(
    `💬 *New parent message* from ${payload.parentEmail} re: ${student?.name ?? 'student'}\n> ${body.trim().slice(0, 200)}`,
  ).catch(() => {});

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

  const studentIds = await getParentStudentIds(payload.parentEmail);
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
