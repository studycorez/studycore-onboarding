import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Delete related records in FK-safe order before removing the student
  const tables = ['xp_events', 'student_emails', 'student_progress', 'contracts', 'sessions'] as const;
  for (const table of tables) {
    const { error: relErr } = await getDb().from(table).delete().eq('student_id', id);
    if (relErr) {
      console.error(`Delete ${table} error:`, relErr);
      return NextResponse.json({ error: `Failed to delete ${table}: ${relErr.message}` }, { status: 500 });
    }
  }

  const { error } = await getDb().from('students').delete().eq('id', id);
  if (error) {
    console.error('Delete student error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
