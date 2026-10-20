import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST() {
  // Show archived tutors here — intentional admin bulk reset; ratings on archived tutors are reset along with active ones
  const { error } = await getDb()
    .from('tutors')
    .update({ rating: 100 } as any)
    .not('id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
