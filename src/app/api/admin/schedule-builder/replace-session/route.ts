import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const { cancel_session_id, new_session } = body;

  if (!cancel_session_id) {
    return NextResponse.json({ error: 'cancel_session_id is required' }, { status: 400 });
  }

  // Verify session exists and is scheduled
  const { data: existing } = await supabase
    .from('sessions')
    .select('id, status')
    .eq('id', cancel_session_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (existing.status !== 'scheduled') {
    return NextResponse.json({ error: 'Can only cancel sessions with status=scheduled' }, { status: 400 });
  }

  // Step 1: Cancel the old session
  const { error: cancelErr } = await supabase
    .from('sessions')
    .update({ status: 'cancelled', payroll_review_required: true })
    .eq('id', cancel_session_id);

  if (cancelErr) {
    return NextResponse.json({ error: `Cancel failed: ${cancelErr.message}` }, { status: 500 });
  }

  // Step 2: Insert replacement if provided (aligned conflict case)
  let newSessionId: string | null = null;

  if (new_session) {
    const { tutor_id, student_id, scheduled_at, duration_minutes } = new_session;
    if (!tutor_id || !student_id || !scheduled_at || !duration_minutes) {
      return NextResponse.json({
        error: 'new_session requires tutor_id, student_id, scheduled_at, duration_minutes',
      }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('sessions')
      .insert({
        tutor_id,
        student_id,
        scheduled_at,
        duration_minutes,
        status: 'scheduled',
        source: 'recurring_schedule',
      })
      .select('id')
      .single();

    if (insertErr) {
      return NextResponse.json({
        error: `Session cancelled but replacement insert failed: ${insertErr.message}`,
      }, { status: 500 });
    }
    newSessionId = inserted.id;
  }

  return NextResponse.json({
    cancelled_id: cancel_session_id,
    new_session_id: newSessionId,
  });
}
