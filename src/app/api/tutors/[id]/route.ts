import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// DELETE now archives rather than hard-deletes.
// sessions.tutor_id has ON DELETE RESTRICT, so hard delete was already broken.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  console.warn(`[tutors/${params.id}] DELETE called — archiving tutor (not hard-deleting)`);
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { data, error } = await supabase
    .from('tutors')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, archived_at')
    .single();

  if (error) {
    console.error('Archive tutor error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tutor: data });
}
