import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const startMs = Date.now();
  const supabase = makeSupabase();
  const now = Date.now();

  // Conservative pre-filter: sessions scheduled at least 48 hours ago
  const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000).toISOString();

  try {
    // Paginate
    const candidates: Array<{ id: string; scheduled_at: string; duration_minutes: number | null }> = [];
    const PAGE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes')
        .eq('attestation_state', 'pending')
        .is('attested_at', null)
        .lt('scheduled_at', fortyEightHoursAgo)
        .range(from, from + PAGE - 1);

      if (error) {
        console.error('[expire-unattested] fetch error:', error.message);
        break;
      }

      candidates.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
      from += PAGE;
    }

    // Filter in JS: session end + 48 hours must have passed
    const expireIds: string[] = [];
    for (const s of candidates) {
      const endMs = new Date(s.scheduled_at).getTime() + ((s.duration_minutes ?? 60) * 60 * 1000);
      const expiresAt = endMs + 48 * 60 * 60 * 1000;
      if (now >= expiresAt) {
        expireIds.push(s.id);
      }
    }

    // Bulk update in batches of 500
    let expired = 0;
    for (let i = 0; i < expireIds.length; i += 500) {
      const batch = expireIds.slice(i, i + 500);
      const { error } = await supabase
        .from('sessions')
        .update({ attestation_state: 'expired' })
        .in('id', batch);

      if (error) {
        console.error(`[expire-unattested] update batch error (offset ${i}):`, error.message);
      } else {
        expired += batch.length;
      }
    }

    const tookMs = Date.now() - startMs;
    return NextResponse.json({
      processed: candidates.length,
      expired,
      took_ms: tookMs,
    });
  } catch (err: any) {
    console.error('[expire-unattested] unexpected error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Unexpected error', took_ms: Date.now() - startMs },
      { status: 500 },
    );
  }
}
