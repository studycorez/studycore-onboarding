import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET() {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const supabase = makeSupabase();

  // Load all unresolved recordings
  const { data: recordings, error: recErr } = await supabase
    .from('fathom_unmatched_recordings')
    .select('id, title, host_email, participant_emails, started_at, fathom_share_url, category')
    .eq('resolved', false)
    .order('started_at', { ascending: false });

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });

  // Active tutors for backfill dropdown
  const { data: tutors, error: tutorErr } = await supabase
    .from('tutors')
    .select('id, name, email')
    .is('archived_at', null)
    .order('name');

  if (tutorErr) return NextResponse.json({ error: tutorErr.message }, { status: 500 });

  // Active students for backfill datalist
  const { data: students, error: studentErr } = await supabase
    .from('students')
    .select('id, name')
    .eq('status', 'active')
    .order('name');

  if (studentErr) return NextResponse.json({ error: studentErr.message }, { status: 500 });

  return NextResponse.json({
    recordings: recordings ?? [],
    tutors:     tutors     ?? [],
    students:   students   ?? [],
  });
}
