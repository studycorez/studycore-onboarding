import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyParentJWT, PARENT_COOKIE_NAME } from '@/lib/parent-auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PARENT_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyParentJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { student_id, days, earliest_start, latest_end, timezone, notes } = await req.json();
  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });
  if (!days?.length) return NextResponse.json({ error: 'At least one day is required' }, { status: 400 });
  if (!earliest_start || !latest_end) return NextResponse.json({ error: 'Start and end times are required' }, { status: 400 });
  if (!timezone) return NextResponse.json({ error: 'Timezone is required' }, { status: 400 });

  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', student_id)
    .ilike('parent_email', payload.parentEmail)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const preferred_availability = { days, earliest_start, latest_end, timezone, notes: notes || null };

  const { error } = await supabase.from('students').update({
    preferred_availability,
    availability_submitted: true,
  }).eq('id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
