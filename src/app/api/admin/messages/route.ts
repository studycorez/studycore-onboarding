import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { postToSlack } from '@/lib/slack';
import { sendGHLSMS } from '@/lib/ghl';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// GET /api/admin/messages?student_id=...
export async function GET(req: NextRequest) {
  const supabase = makeSupabase();
  const studentId = req.nextUrl.searchParams.get('student_id');

  const q = supabase
    .from('messages')
    .select('id, student_id, sender_role, body, read_at, created_at')
    .order('created_at');

  const { data } = studentId ? await q.eq('student_id', studentId) : await q;
  return NextResponse.json(data ?? []);
}

// POST /api/admin/messages — admin reply
export async function POST(req: NextRequest) {
  const supabase = makeSupabase();
  const { student_id, body } = await req.json();
  if (!student_id || !body?.trim()) {
    return NextResponse.json({ error: 'student_id and body required' }, { status: 400 });
  }

  const { data: msg } = await supabase
    .from('messages')
    .insert({ student_id, sender_role: 'admin', body: body.trim() })
    .select()
    .single();

  // Mark all parent messages for this student as read
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('student_id', student_id)
    .neq('sender_role', 'admin')
    .is('read_at', null);

  const { data: student } = await supabase
    .from('students')
    .select('name, parent_email')
    .eq('id', student_id)
    .single();

  const studentName  = student?.name ?? 'student';
  const parentEmail  = student?.parent_email ?? '';
  const preview      = body.trim().slice(0, 100);
  const portalUrl    = 'https://studycore-eight.vercel.app/parent-portal/messages';

  // Non-blocking: Slack + SMS to parent
  Promise.allSettled([
    postToSlack(
      `✉️ *Admin replied* to ${studentName} (${parentEmail})\n> ${body.trim().slice(0, 200)}`,
    ),
    parentEmail
      ? sendGHLSMS(
          parentEmail,
          `New message from StudyCore Support: ${preview}${preview.length < body.trim().length ? '…' : ''}. Log in to view: ${portalUrl}`,
        )
      : Promise.resolve(),
  ]).catch(() => {});

  return NextResponse.json(msg);
}
