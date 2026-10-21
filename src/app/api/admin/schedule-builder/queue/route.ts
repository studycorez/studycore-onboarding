import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();

  // Query 1: active, non-archived tutors
  const { data: tutors, error: tutorErr } = await supabase
    .from('tutors')
    .select('id, name, email, timezone')
    .eq('active', true)
    .is('archived_at', null)
    .order('name');

  if (tutorErr) return NextResponse.json({ error: tutorErr.message }, { status: 500 });
  if (!tutors?.length) return NextResponse.json([]);

  const tutorIds = tutors.map((t: any) => t.id);

  // Queries 2+3 in parallel: signed contract counts + schedule counts
  const [{ data: contracts }, { data: schedules }] = await Promise.all([
    supabase
      .from('contracts')
      .select('tutor_id')
      .in('tutor_id', tutorIds)
      .eq('status', 'signed'),
    supabase
      .from('tutor_reported_schedules')
      .select('tutor_id')
      .in('tutor_id', tutorIds),
  ]);

  // O(n) aggregation via Record lookups
  const contractCounts: Record<string, number> = {};
  for (const c of contracts ?? []) {
    contractCounts[c.tutor_id] = (contractCounts[c.tutor_id] ?? 0) + 1;
  }

  const scheduleCounts: Record<string, number> = {};
  for (const s of schedules ?? []) {
    scheduleCounts[s.tutor_id] = (scheduleCounts[s.tutor_id] ?? 0) + 1;
  }

  // Build result: only tutors with at least 1 signed contract
  const result = tutors
    .filter((t: any) => (contractCounts[t.id] ?? 0) > 0)
    .map((t: any) => {
      const scheduleCount = scheduleCounts[t.id] ?? 0;
      return {
        tutor_id: t.id,
        name: t.name,
        email: t.email,
        timezone: t.timezone ?? null,
        contract_count: contractCounts[t.id] ?? 0,
        schedule_count: scheduleCount,
        status: (scheduleCount === 0 ? 'unprocessed' : 'processed') as 'unprocessed' | 'processed',
      };
    });

  // Sort: unprocessed first, then by name within each group
  result.sort((a: any, b: any) => {
    if (a.status !== b.status) return a.status === 'unprocessed' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json(result);
}
