import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const toStatus = req.nextUrl.searchParams.get('to');

  if (!toStatus || !['active', 'completed', 'paused', 'refunded'].includes(toStatus)) {
    return NextResponse.json({ error: 'to query param required (active|completed|paused|refunded)' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const isTerminal = toStatus === 'completed' || toStatus === 'refunded';

  // Count future scheduled sessions
  const { count: futureCount } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', params.id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowIso);

  // Count zoom meetings in future scheduled sessions
  const { count: zoomCount } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', params.id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', nowIso)
    .not('zoom_meeting_id', 'is', null);

  // Count past completed sessions not yet finalized (only relevant for terminal)
  let pastToLock = 0;
  if (isTerminal) {
    const { count } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', params.id)
      .eq('status', 'completed')
      .lt('scheduled_at', nowIso)
      .eq('hours_finalized', false);
    pastToLock = count ?? 0;
  }

  return NextResponse.json({
    future_sessions_to_cancel: futureCount ?? 0,
    past_sessions_to_lock: pastToLock,
    zoom_meetings_to_delete: zoomCount ?? 0,
  });
}
