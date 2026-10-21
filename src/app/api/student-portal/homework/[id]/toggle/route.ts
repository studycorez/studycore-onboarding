import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStudentJWT, STUDENT_COOKIE_NAME } from '@/lib/student-auth';
import { awardXP } from '@/lib/xp';

export const dynamic = 'force-dynamic';

function makeSupabase() {
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
  const token = req.cookies.get(STUDENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyStudentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { completed } = await req.json() as { completed: boolean };
  const itemId = params.id;

  const supabase = makeSupabase();

  // Fetch the item and verify ownership
  const { data: item, error: fetchErr } = await supabase
    .from('homework_items')
    .select('id, student_id, description, estimated_minutes, completed')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchErr || !item) {
    return NextResponse.json({ error: 'Homework item not found' }, { status: 404 });
  }
  if (item.student_id !== payload.studentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Compute XP: ceil(estimated_minutes × 1.5) if set, else 25 flat
  const xpAmount = item.estimated_minutes != null
    ? Math.ceil(item.estimated_minutes * 1.5)
    : 25;

  if (completed) {
    // Mark complete
    const { error: updateErr } = await supabase
      .from('homework_items')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', itemId);

    if (updateErr) {
      console.error('[homework/toggle] update error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Award XP — idempotency key prevents double-award on re-check.
    // Fatal: if XP award throws, revert the completed update and return 500.
    let awarded = false;
    try {
      const result = await awardXP(
        supabase,
        payload.studentId,
        xpAmount,
        'homework_completed',
        `Completed homework: ${item.description.slice(0, 100)}`,
        `homework_item:${itemId}`,
      );
      awarded = result.awarded;
    } catch (xpErr: any) {
      console.error('[homework/toggle] awardXP error — reverting completion:', xpErr.message);
      // Revert the homework_items update to keep DB state consistent
      await supabase
        .from('homework_items')
        .update({ completed: false, completed_at: null })
        .eq('id', itemId);
      return NextResponse.json(
        { error: 'Failed to award XP. Your progress was not saved. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, completed: true, xp_awarded: awarded ? xpAmount : 0 });
  } else {
    // Uncheck — just clear completed state, no XP subtraction
    const { error: updateErr } = await supabase
      .from('homework_items')
      .update({ completed: false, completed_at: null })
      .eq('id', itemId);

    if (updateErr) {
      console.error('[homework/toggle] uncheck error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, completed: false, xp_awarded: 0 });
  }
}
