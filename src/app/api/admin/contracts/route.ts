import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const CONTRACT_SELECT = '*, tutor:tutors(id, name, email, hourly_rate), student:students(id, name, email, grade, target_score, current_score, purchased_hours, used_hours, game_plan_url)';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();

  const statusParam = req.nextUrl.searchParams.get('status');
  const statusFilter = statusParam ? statusParam.split(',').map(s => s.trim()).filter(Boolean) : null;
  const tutorId = req.nextUrl.searchParams.get('tutor_id');
  const studentId = req.nextUrl.searchParams.get('student_id');

  let q = supabase
    .from('contracts')
    .select(CONTRACT_SELECT);

  if (statusFilter && statusFilter.length > 0) {
    q = q.in('status', statusFilter);
  }
  if (tutorId) {
    q = q.eq('tutor_id', tutorId);
  }
  if (studentId) {
    q = q.eq('student_id', studentId);
  }

  const { data, error } = await q.order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contracts: data ?? [] });
}
