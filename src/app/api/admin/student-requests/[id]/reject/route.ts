import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendStudentRequestRejectedEmail } from '@/lib/email';
import { postSlackNotification } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { rejection_reason } = body;

  if (!rejection_reason || typeof rejection_reason !== 'string' || rejection_reason.trim().length < 5) {
    return NextResponse.json({ error: 'Rejection reason is required (min 5 characters)' }, { status: 400 });
  }

  // Fetch request
  const { data: request, error: fetchErr } = await supabase
    .from('student_add_requests')
    .select('*, tutor:tutors(id, name, email)')
    .eq('id', params.id)
    .single();

  if (fetchErr || !request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
  }

  const now = new Date().toISOString();

  await supabase
    .from('student_add_requests')
    .update({
      status: 'rejected',
      rejection_reason: rejection_reason.trim(),
      reviewed_at: now,
      reviewed_by: user.email,
      updated_at: now,
    })
    .eq('id', params.id);

  // Email tutor
  const tutor = request.tutor as any;
  if (tutor?.email) {
    sendStudentRequestRejectedEmail(tutor.email, tutor.name, request.student_name, rejection_reason.trim())
      .catch(e => console.error('[student-requests/reject] Email failed:', e));
  }

  // Slack
  postSlackNotification(
    `❌ Student request rejected: ${request.student_name} → ${tutor?.name ?? 'Unknown'} (by ${user.email}). Reason: ${rejection_reason.trim()}`
  ).catch(() => {});

  return NextResponse.json({ success: true });
}
