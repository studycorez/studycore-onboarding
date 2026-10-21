import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
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

  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*, student:students(id, name, email, parent_email)')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Check for session report
  const { data: report } = await supabase
    .from('session_reports')
    .select('id')
    .eq('session_id', params.id)
    .maybeSingle();

  return NextResponse.json({
    session,
    has_zoom: !!(session.zoom_meeting_id),
    has_fathom: !!(session.fathom_recording_url),
    has_report: !!report,
    hours_finalized: !!(session.hours_finalized),
    has_attestation: !!(session.attested_at),
  });
}

export async function PATCH(
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

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));

  // Validate status transition
  if (body.status != null) {
    const { data: existing } = await supabase
      .from('sessions')
      .select('status')
      .eq('id', params.id)
      .maybeSingle();

    if (!existing) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    if (existing.status !== 'scheduled' || body.status !== 'cancelled') {
      return NextResponse.json({
        error: 'Status transition not allowed via this endpoint. Only scheduled → cancelled is permitted.',
      }, { status: 400 });
    }
  }

  // Validate other fields
  if (body.scheduled_at != null && isNaN(Date.parse(body.scheduled_at))) {
    return NextResponse.json({ error: 'scheduled_at must be a valid ISO date' }, { status: 400 });
  }
  if (body.duration_minutes != null && (typeof body.duration_minutes !== 'number' || body.duration_minutes <= 0)) {
    return NextResponse.json({ error: 'duration_minutes must be a positive number' }, { status: 400 });
  }

  // Build update payload — only include provided fields
  const update: Record<string, any> = {};
  if (body.status != null) update.status = body.status;
  if (body.scheduled_at != null) update.scheduled_at = body.scheduled_at;
  if (body.duration_minutes != null) update.duration_minutes = body.duration_minutes;
  if (body.payroll_review_required != null) update.payroll_review_required = body.payroll_review_required;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from('sessions')
    .update(update)
    .eq('id', params.id)
    .select('*')
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
