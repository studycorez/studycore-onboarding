import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .ilike('parent_email', payload.parentEmail);

  if (!students?.length) {
    return NextResponse.json({ reports: [] });
  }

  const studentIds = students.map(s => s.id);
  const studentMap = Object.fromEntries(students.map(s => [s.id, s.name]));

  const { data: reports } = await supabase
    .from('weekly_reports')
    .select('id, student_id, week_of, report_html, ai_summary, sessions_count, hours_this_week, created_at')
    .in('student_id', studentIds)
    .order('week_of', { ascending: false })
    .limit(52);

  const enriched = (reports ?? []).map((r: any) => ({
    ...r,
    studentName: studentMap[r.student_id] ?? '',
  }));

  return NextResponse.json({ reports: enriched });
}
