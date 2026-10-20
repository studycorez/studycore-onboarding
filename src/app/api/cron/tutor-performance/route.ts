import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';
import { postToSlack } from '@/lib/slack';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  const prevWeek    = subWeeks(new Date(), 1);
  const periodStart = format(startOfWeek(prevWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const periodEnd   = format(endOfWeek(prevWeek,   { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: sessions, error } = await getDb()
    .from('sessions')
    .select('tutor_id, status, tutor_rating, tutor:tutors(name)')
    .gte('scheduled_at', periodStart + 'T00:00:00.000Z')
    .lte('scheduled_at', periodEnd   + 'T23:59:59.999Z');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate by tutor
  const map = new Map<string, {
    name: string;
    total: number;
    completed: number;
    noShow: number;
    ratings: number[];
  }>();

  for (const s of sessions ?? []) {
    const tutor = (s as any).tutor;
    if (!s.tutor_id || !tutor) continue;
    if (!map.has(s.tutor_id)) {
      map.set(s.tutor_id, { name: tutor.name, total: 0, completed: 0, noShow: 0, ratings: [] });
    }
    const entry = map.get(s.tutor_id)!;
    entry.total++;
    if (s.status === 'completed') entry.completed++;
    if (s.status === 'no_show_tutor' || s.status === 'no_show_both') entry.noShow++;
    if (s.tutor_rating != null) entry.ratings.push(s.tutor_rating);
  }

  if (map.size === 0) {
    return NextResponse.json({ ok: true, message: 'No sessions this week' });
  }

  const lines = Array.from(map.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(e => {
      const rate = e.total > 0 ? Math.round((e.completed / e.total) * 100) : 0;
      const avg  = e.ratings.length
        ? (e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length).toFixed(1)
        : '—';
      const noShowStr = e.noShow > 0 ? ` ⚠️ ${e.noShow} no-show` : '';
      return `• *${e.name}*: ${e.completed}/${e.total} sessions (${rate}%)${noShowStr} | Rating: ${avg}`;
    });

  const message = [
    `📊 *Tutor Performance: ${periodStart} → ${periodEnd}*`,
    ...lines,
  ].join('\n');

  await postToSlack(message);

  return NextResponse.json({ ok: true, tutors: map.size });
}
