import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const CONTRACT_SELECT = [
  'id', 'tutor_id', 'student_id', 'hourly_rate', 'status', 'signed_at',
  'game_plan_url', 'permanent_zoom_link', 'created_at',
  'tutor:tutors(id, name, email)',
].join(', ');

export async function GET(req: NextRequest) {
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilter = statusParam ? statusParam.split(',').map(s => s.trim()).filter(Boolean) : null;

  let q = supabase
    .from('contracts')
    .select(CONTRACT_SELECT)
    .eq('student_id', payload.studentId);

  if (statusFilter && statusFilter.length > 0) {
    q = q.in('status', statusFilter);
  }

  const { data, error } = await q.order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contracts: data ?? [] });
}
