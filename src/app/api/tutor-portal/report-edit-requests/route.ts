import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { report_id, reason } = await req.json() as { report_id: string; reason: string };
  if (!report_id || !reason?.trim()) {
    return NextResponse.json({ error: 'report_id and reason required' }, { status: 400 });
  }

  const supabase = makeSupabase();

  const { data: report } = await supabase
    .from('session_reports')
    .select('id, tutor_id')
    .eq('id', report_id)
    .maybeSingle();

  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (report.tutor_id !== payload.tutorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('session_reports')
    .update({
      edit_requested_at:   new Date().toISOString(),
      edit_request_reason: reason.trim(),
    })
    .eq('id', report_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
