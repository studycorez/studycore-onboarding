import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendReportDueTutor } from '@/lib/email';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  try {
    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const { data: s } = await getDb()
      .from('sessions')
      .select('id, scheduled_at, tutor:tutors(email, name), student:students(name, timezone)')
      .eq('id', sessionId)
      .single();

    if (!s) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    const tutor   = (s as any).tutor;
    const student = (s as any).student;
    if (!tutor?.email) return NextResponse.json({ error: 'No tutor email' }, { status: 400 });

    await sendReportDueTutor({
      tutorEmail: tutor.email,
      tutorName: tutor.name,
      studentName: student?.name ?? 'your student',
      scheduledAt: s.scheduled_at,
      timezone: student?.timezone ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
