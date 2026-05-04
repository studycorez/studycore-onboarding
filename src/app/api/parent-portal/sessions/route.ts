import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get all student IDs for this parent
  const { data: students } = await supabase
    .from('students')
    .select('id')
    .ilike('parent_email', payload.parentEmail);

  if (!students?.length) {
    return NextResponse.json({ sessions: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const studentIds = students.map(s => s.id);

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, student_id, scheduled_at, duration_minutes, status, zoom_join_url, tutor:tutors(name)')
    .in('student_id', studentIds)
    .eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10);

  return NextResponse.json(
    { sessions: sessions ?? [] },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
