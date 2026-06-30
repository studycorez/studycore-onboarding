import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { applyStatusSideEffects } from '@/lib/students/applyStatusSideEffects';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = new Set(['active', 'completed', 'paused', 'refunded']);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
  const { to_status, reason } = body;

  if (!to_status || !VALID_STATUSES.has(to_status)) {
    return NextResponse.json({
      error: 'to_status must be one of: active, completed, paused, refunded',
    }, { status: 400 });
  }

  if (reason != null && typeof reason !== 'string') {
    return NextResponse.json({ error: 'reason must be a string' }, { status: 400 });
  }

  // Fetch current student
  const { data: student, error: fetchErr } = await supabase
    .from('students')
    .select('id, name, status')
    .eq('id', params.id)
    .maybeSingle();

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (student.status === to_status) {
    return NextResponse.json({ error: 'No change needed' }, { status: 400 });
  }

  const fromStatus = student.status;

  // Insert audit row
  const { data: audit, error: auditErr } = await supabase
    .from('student_status_changes')
    .insert({
      student_id: params.id,
      from_status: fromStatus,
      to_status,
      reason: reason?.trim() || null,
      changed_by_admin_id: user.id,
    })
    .select('id')
    .single();

  if (auditErr) {
    return NextResponse.json({ error: `Audit insert failed: ${auditErr.message}` }, { status: 500 });
  }

  // Update student status
  const { error: updateErr } = await supabase
    .from('students')
    .update({ status: to_status })
    .eq('id', params.id);

  if (updateErr) {
    return NextResponse.json({ error: `Status update failed: ${updateErr.message}` }, { status: 500 });
  }

  // Apply side effects (non-blocking: status update already succeeded)
  const warnings: string[] = [];
  let sideEffects = null;

  try {
    sideEffects = await applyStatusSideEffects(
      params.id, fromStatus, to_status, supabase, audit.id,
    );
    if (sideEffects.warnings.length > 0) {
      warnings.push(...sideEffects.warnings);
    }
  } catch (err: any) {
    warnings.push(`Side effects failed: ${err.message ?? 'unknown error'}`);
  }

  return NextResponse.json({
    success: true,
    audit_id: audit.id,
    from_status: fromStatus,
    to_status,
    side_effects: sideEffects ? {
      cancelled_future_count: sideEffects.cancelled_future_count,
      locked_past_count: sideEffects.locked_past_count,
      zoom_queue_count: sideEffects.zoom_queue_count,
      cancelled_session_ids: sideEffects.cancelled_session_ids,
    } : null,
    warnings,
  });
}
