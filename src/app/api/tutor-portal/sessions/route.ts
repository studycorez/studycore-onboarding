import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

const VALID_FILTERS = ['all', 'scheduled', 'pending_approval', 'completed', 'cancelled'];

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );

  const filter = req.nextUrl.searchParams.get('filter') ?? 'all';
  const safeFilter = VALID_FILTERS.includes(filter) ? filter : 'all';

  let q = supabase
    .from('sessions')
    .select('*, student:students(name), session_report:session_reports(id, submitted_at)')
    .eq('tutor_id', payload.tutorId)
    .order('scheduled_at', { ascending: false })
    .limit(100);

  if (safeFilter !== 'all') q = q.eq('status', safeFilter);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
