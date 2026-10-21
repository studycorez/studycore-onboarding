import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

export const dynamic = 'force-dynamic';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { student_id } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const { data: student } = await getDb()
    .from('students')
    .select('id')
    .eq('id', student_id)
    .ilike('parent_email', payload.parentEmail)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const { error } = await getDb()
    .from('students')
    .update({ game_plan_acknowledged: true })
    .eq('id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
