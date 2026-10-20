import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/cron-auth';
import { createClient } from '@supabase/supabase-js';
import { syncSessionAttendance } from '@/lib/zoom-attendance';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

const LOOKBACK_DAYS = 7;
const SESSION_CAP   = 50;

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceIso = since.toISOString();

  // Completed sessions in the last 7 days that haven't been synced yet
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id')
    .eq('status', 'completed')
    .not('zoom_meeting_id', 'is', null)
    .is('zoom_attendance_synced_at', null)
    .gte('scheduled_at', sinceIso)
    .order('scheduled_at', { ascending: false })
    .limit(SESSION_CAP);

  if (error) {
    console.error('[cron/zoom-attendance] query error:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (sessions ?? []).map((s: any) => s.id as string);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, errors: 0, message: 'No sessions pending sync' });
  }

  let synced = 0;
  let errors = 0;

  for (const id of ids) {
    try {
      await syncSessionAttendance(id);
      synced++;
    } catch (err: any) {
      console.error(`[cron/zoom-attendance] failed session ${id}:`, err.message);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, synced, errors, timestamp: new Date().toISOString() });
}
