import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/admin/fathom-sync/unmatched
// Returns unresolved unmatched recordings, optionally filtered by category
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category'); // 'tutor_recognized_no_session' | 'no_known_participants' | null

  const supabase = supabaseAdmin();
  let query = supabase
    .from('fathom_unmatched_recordings')
    .select('*')
    .eq('resolved', false)
    .order('last_seen_at', { ascending: false })
    .limit(200);

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// PATCH /api/admin/fathom-sync/unmatched
// Body: { id: string, action: 'match' | 'dismiss', session_id?: string }
// 'match' — resolve by linking to a session (inserts into session_recordings)
// 'dismiss' — mark as resolved without linking
export async function PATCH(req: NextRequest) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id, action, session_id } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  if (action === 'dismiss') {
    const { error } = await supabase
      .from('fathom_unmatched_recordings')
      .update({ resolved: true })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'match') {
    if (!session_id) {
      return NextResponse.json({ error: 'session_id required for match action' }, { status: 400 });
    }

    // Get the unmatched recording details
    const { data: unmatched, error: fetchErr } = await supabase
      .from('fathom_unmatched_recordings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !unmatched) {
      return NextResponse.json({ error: 'Unmatched recording not found' }, { status: 404 });
    }

    // Insert into session_recordings
    const { error: insertErr } = await supabase
      .from('session_recordings')
      .insert({
        session_id,
        fathom_recording_id: unmatched.fathom_recording_id,
        fathom_recording_url: unmatched.fathom_share_url ?? `https://fathom.video/rec/${unmatched.fathom_recording_id}`,
        fathom_share_url: unmatched.fathom_share_url,
        recording_start_time: unmatched.started_at,
        match_method: 'manual',
        is_primary: false,
      });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Pick primary recording for this session
    const { data: recs } = await supabase
      .from('session_recordings')
      .select('id, fathom_recording_url, duration_seconds, recording_start_time')
      .eq('session_id', session_id);

    if (recs && recs.length > 0) {
      const sorted = [...recs].sort((a, b) => {
        const da = a.duration_seconds ?? 0, db = b.duration_seconds ?? 0;
        if (db !== da) return db - da;
        const ta = a.recording_start_time ? new Date(a.recording_start_time).getTime() : Infinity;
        const tb = b.recording_start_time ? new Date(b.recording_start_time).getTime() : Infinity;
        return ta - tb;
      });
      await supabase.from('session_recordings').update({ is_primary: false }).eq('session_id', session_id);
      await supabase.from('session_recordings').update({ is_primary: true }).eq('id', sorted[0].id);
      await supabase.from('sessions').update({ fathom_recording_url: sorted[0].fathom_recording_url }).eq('id', session_id);
    }

    // Mark the unmatched recording as resolved
    await supabase
      .from('fathom_unmatched_recordings')
      .update({ resolved: true, resolved_session_id: session_id })
      .eq('id', id);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
