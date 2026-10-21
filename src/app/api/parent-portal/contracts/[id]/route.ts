import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const CONTRACT_SELECT = [
  'id', 'tutor_id', 'student_id', 'hourly_rate', 'status', 'signed_at',
  'game_plan_url', 'permanent_zoom_link', 'created_at',
  'tutor:tutors(id, name, email)',
].join(', ');

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  // Find the parent's students
  const { data: students } = await supabase
    .from('students')
    .select('id')
    .ilike('parent_email', payload.parentEmail);

  if (!students?.length) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const studentIds = students.map(s => s.id);

  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_SELECT)
    .eq('id', params.id)
    .in('student_id', studentIds)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  return NextResponse.json({ contract: data });
}
