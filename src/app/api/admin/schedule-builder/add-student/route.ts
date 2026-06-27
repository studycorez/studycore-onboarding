import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { assignTutorToStudent } from '@/lib/contracts/assignTutorToStudent';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const { tutor_id, student_id } = body;

  if (!tutor_id) return NextResponse.json({ error: 'tutor_id is required' }, { status: 400 });
  if (!student_id) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });

  // Verify tutor exists
  const { data: tutor } = await supabase
    .from('tutors')
    .select('id, hourly_rate')
    .eq('id', tutor_id)
    .maybeSingle();

  if (!tutor) return NextResponse.json({ error: 'Tutor not found' }, { status: 404 });

  if (tutor.hourly_rate == null) {
    return NextResponse.json({
      error: 'Tutor has no hourly rate set. Set it on the Tutors page before assigning students.',
    }, { status: 400 });
  }

  // Verify student exists
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', student_id)
    .maybeSingle();

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const result = await assignTutorToStudent(tutor_id, student_id, supabase);

  if (result.error) {
    const status = result.error.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    success: true,
    contract_id: result.contractId,
    already_assigned: result.alreadySigned,
    was_new: !result.alreadySigned,
  });
}
