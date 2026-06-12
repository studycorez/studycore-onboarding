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

  const statusFilter = req.nextUrl.searchParams.get('status') ?? 'pending';
  const validStatuses = ['pending', 'approved', 'rejected', 'all'];
  const status = validStatuses.includes(statusFilter) ? statusFilter : 'pending';

  let query = supabase
    .from('session_proposals')
    .select('id, tutor_id, student_id, scheduled_at, duration_minutes, what_covered, tutor_notes, status, admin_notes, created_at, reviewed_at, created_session_id, tutor:tutors(name, timezone), student:students(name)')
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const proposals = (data ?? []).map((p: any) => ({
    id: p.id,
    tutor_id: p.tutor_id,
    tutor_name: p.tutor?.name ?? '',
    tutor_timezone: p.tutor?.timezone ?? 'America/Los_Angeles',
    student_id: p.student_id,
    student_name: p.student?.name ?? '',
    scheduled_at: p.scheduled_at,
    duration_minutes: p.duration_minutes,
    what_covered: p.what_covered,
    tutor_notes: p.tutor_notes,
    status: p.status,
    admin_notes: p.admin_notes,
    created_at: p.created_at,
    reviewed_at: p.reviewed_at,
    created_session_id: p.created_session_id,
  }));

  return NextResponse.json({ proposals });
}
