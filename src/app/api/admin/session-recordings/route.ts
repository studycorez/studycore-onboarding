import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/session-recordings?session_id=<uuid>
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const sessionId = new URL(req.url).searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from('session_recordings')
    .select('id, fathom_recording_id, fathom_recording_url, fathom_share_url, recording_start_time, recording_end_time, duration_seconds, match_method, is_primary, created_at')
    .eq('session_id', sessionId)
    .order('is_primary', { ascending: false })
    .order('duration_seconds', { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH /api/admin/session-recordings
// Body: { recording_id: string, session_id: string }
// Sets the given recording as primary and updates sessions.fathom_recording_url
export async function PATCH(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { recording_id, session_id } = await req.json();
  if (!recording_id || !session_id) {
    return NextResponse.json({ error: 'recording_id and session_id required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // Get the target recording's URL
  const { data: rec, error: fetchErr } = await supabase
    .from('session_recordings')
    .select('id, fathom_recording_url')
    .eq('id', recording_id)
    .eq('session_id', session_id)
    .single();

  if (fetchErr || !rec) {
    return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
  }

  // Reset all recordings for this session to non-primary
  const { error: resetErr } = await supabase
    .from('session_recordings')
    .update({ is_primary: false })
    .eq('session_id', session_id);

  if (resetErr) return NextResponse.json({ error: resetErr.message }, { status: 500 });

  // Set the target recording as primary
  const { error: setErr } = await supabase
    .from('session_recordings')
    .update({ is_primary: true })
    .eq('id', recording_id);

  if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });

  // Update sessions.fathom_recording_url to the primary recording's URL
  await supabase
    .from('sessions')
    .update({ fathom_recording_url: rec.fathom_recording_url })
    .eq('id', session_id);

  return NextResponse.json({ ok: true, primaryUrl: rec.fathom_recording_url });
}
