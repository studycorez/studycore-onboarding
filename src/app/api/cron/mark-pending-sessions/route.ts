import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
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

  // Conservative pre-filter: sessions that ended at least 1 hour ago
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();

  try {
    // Paginate to handle large backlogs
    const candidates: Array<{ id: string; scheduled_at: string; duration_minutes: number | null }> = [];
    const PAGE = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, scheduled_at, duration_minutes')
        .is('attestation_state', null)
        .in('status', ['completed', 'no_show_student'])
        .lt('scheduled_at', oneHourAgo)
        .range(from, from + PAGE - 1);

      if (error) {
        console.error('[mark-pending] fetch error:', error.message);
        break;
      }

      candidates.push(...(data ?? []));
      if ((data ?? []).length < PAGE) break;
      from += PAGE;
    }

    // Filter in JS: session end + 1 hour grace must have passed
    const readyIds: string[] = [];
    for (const s of candidates) {
      const endMs = new Date(s.scheduled_at).getTime() + ((s.duration_minutes ?? 60) * 60 * 1000);
      const readyAt = endMs + 60 * 60 * 1000; // +1 hour grace
      if (now >= readyAt) {
        readyIds.push(s.id);
      }
    }

    // Bulk update in batches of 500 (Supabase .in() limit)
    let markedPending = 0;
    for (let i = 0; i < readyIds.length; i += 500) {
      const batch = readyIds.slice(i, i + 500);
      const { error } = await supabase
        .from('sessions')
        .update({ attestation_state: 'pending' })
        .in('id', batch);

      if (error) {
        console.error(`[mark-pending] update batch error (offset ${i}):`, error.message);
      } else {
        markedPending += batch.length;
      }
    }

    const tookMs = Date.now() - startMs;
    return NextResponse.json({
      processed: candidates.length,
      marked_pending: markedPending,
      took_ms: tookMs,
    });
  } catch (err: any) {
    console.error('[mark-pending] unexpected error:', err);
    return NextResponse.json(
      { error: err.message ?? 'Unexpected error', took_ms: Date.now() - startMs },
      { status: 500 },
    );
  }
}
