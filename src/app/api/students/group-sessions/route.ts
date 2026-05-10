import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// PATCH /api/students/group-sessions
// Body: { studentId, group_sessions_enabled, group_session_hours_allocated }
export async function PATCH(req: NextRequest) {
  const { studentId, group_sessions_enabled, group_session_hours_allocated } = await req.json();
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (group_sessions_enabled !== undefined) update.group_sessions_enabled = group_sessions_enabled;
  if (group_session_hours_allocated !== undefined) {
    update.group_session_hours_allocated = parseFloat(group_session_hours_allocated) || 0;
  }

  const { error } = await supabase.from('students').update(update).eq('id', studentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
