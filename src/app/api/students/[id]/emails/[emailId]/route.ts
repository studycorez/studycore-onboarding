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
  { params }: { params: { id: string; emailId: string } },
) {
  const { id, emailId } = params;
  const { error } = await getDb()
    .from('student_emails')
    .delete()
    .eq('id', emailId)
    .eq('student_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
