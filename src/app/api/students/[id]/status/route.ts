import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { upsertGHLContact } from '@/lib/ghl';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const VALID_STATUSES = ['active', 'completed', 'refunded', 'paused'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { status } = await req.json();
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { error, data: updated } = await supabase
    .from('students')
    .update({ status })
    .eq('id', id)
    .select('name, email, phone')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync status tag to GHL (best-effort)
  if (updated) {
    upsertGHLContact({
      name:  updated.name,
      email: updated.email,
      phone: updated.phone,
      tags:  ['studycore-student', status],
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
