import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = makeSupabase();

  const now = new Date();
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [sessionsRes, contractRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, scheduled_at, duration_minutes, status, zoom_join_url, tutor:tutors(id, name)')
      .eq('student_id', id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in30Days.toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('contracts')
      .select('permanent_zoom_link')
      .eq('student_id', id)
      .eq('status', 'signed')
      .not('permanent_zoom_link', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const permanentZoomLink: string | null = (contractRes.data as any)?.permanent_zoom_link ?? null;

  // Group sessions by day-of-week (0=Sun … 6=Sat)
  const byDow: Record<number, any[]> = {};
  for (const s of (sessionsRes.data ?? []) as any[]) {
    const dow = new Date(s.scheduled_at).getDay();
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push({
      ...s,
      zoom_join_url: s.zoom_join_url ?? permanentZoomLink ?? null,
      permanent_zoom_link: permanentZoomLink,
    });
  }

  const sessions = (sessionsRes.data ?? []).map((s: any) => ({
    ...s,
    zoom_join_url: s.zoom_join_url ?? permanentZoomLink ?? null,
    permanent_zoom_link: permanentZoomLink,
  }));

  return NextResponse.json(
    { sessions, by_dow: byDow, permanent_zoom_link: permanentZoomLink },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
