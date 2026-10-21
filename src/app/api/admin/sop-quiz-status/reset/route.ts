import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCurrentSopVersion } from '@/lib/sop-quiz';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tutorId = body.tutor_id;

  if (!tutorId || typeof tutorId !== 'string') {
    return NextResponse.json({ error: 'tutor_id is required' }, { status: 400 });
  }

  if (!UUID_REGEX.test(tutorId)) {
    return NextResponse.json({ error: 'tutor_id must be a valid UUID' }, { status: 400 });
  }

  const supabase = makeServiceSupabase();

  const version = await getCurrentSopVersion(supabase);
  if (!version) {
    return NextResponse.json({ error: 'No SOP version configured' }, { status: 404 });
  }

  const { error } = await supabase
    .from('tutor_sop_acknowledgments')
    .delete()
    .eq('tutor_id', tutorId)
    .eq('version_id', version.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Slack alert
  const { data: tutor } = await supabase
    .from('tutors')
    .select('name')
    .eq('id', tutorId)
    .single();

  postToSlack(
    `🔄 SOP quiz reset: ${tutor?.name ?? tutorId} by admin ${user.email}`
  ).catch(e => console.error('[sop-quiz/reset] Slack alert failed:', e));

  return NextResponse.json({ success: true });
}
