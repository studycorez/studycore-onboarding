import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: completedSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('tutor_id', payload.tutorId)
    .eq('status', 'completed')
    .gte('scheduled_at', sevenDaysAgo);

  if (!completedSessions?.length) {
    return NextResponse.json({ missing: 0 });
  }

  const sessionIds = completedSessions.map(s => s.id);
  const { data: reports } = await supabase
    .from('session_reports')
    .select('session_id')
    .in('session_id', sessionIds);

  const reportedSet = new Set((reports ?? []).map(r => r.session_id));
  const missing = completedSessions.filter(s => !reportedSet.has(s.id)).length;

  return NextResponse.json({ missing });
}
