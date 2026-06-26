import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendStudentRequestApprovedEmail, sendContractAssignedNotification } from '@/lib/email';
import { postSlackNotification } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { student_id } = body;

  if (!student_id || typeof student_id !== 'string') {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  }

  // Fetch request
  const { data: request, error: fetchErr } = await supabase
    .from('student_add_requests')
    .select('*, tutor:tutors(id, name, email)')
    .eq('id', params.id)
    .single();

  if (fetchErr || !request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'Already reviewed or invalid' }, { status: 409 });
  }

  // Verify student exists
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', student_id)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // Look up tutor's hourly rate from DB
  const { data: tutorRecord } = await supabase
    .from('tutors')
    .select('hourly_rate, name')
    .eq('id', request.tutor_id)
    .single();

  if (!tutorRecord || tutorRecord.hourly_rate == null) {
    return NextResponse.json({
      error: `Cannot create contract: ${tutorRecord?.name ?? 'tutor'}'s hourly rate is not set. Set the rate before approving the request.`,
    }, { status: 400 });
  }

  const hourly_rate = tutorRecord.hourly_rate;
  const now = new Date().toISOString();

  // Create contract
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .insert({
      tutor_id: request.tutor_id,
      student_id,
      hourly_rate,
      status: 'signed',
      signed_at: now,
    })
    .select('id')
    .single();

  if (contractErr || !contract) {
    return NextResponse.json({ error: `Failed to create contract: ${contractErr?.message}` }, { status: 500 });
  }

  // Update request
  await supabase
    .from('student_add_requests')
    .update({
      status: 'approved',
      created_student_id: student_id,
      created_contract_id: contract.id,
      reviewed_at: now,
      reviewed_by: user.email,
      updated_at: now,
    })
    .eq('id', params.id);

  // Email tutor — approval notification + contract assignment
  const tutor = request.tutor as any;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.studycore.net';
  if (tutor?.email) {
    sendStudentRequestApprovedEmail(tutor.email, tutor.name, request.student_name)
      .catch(e => console.error('[student-requests/complete] Approval email failed:', e));
    sendContractAssignedNotification({
      tutorEmail: tutor.email,
      tutorName: tutor.name,
      studentName: request.student_name,
      hourlyRate: hourly_rate,
      contractId: contract.id,
      appUrl,
    }).catch(e => console.error('[student-requests/complete] Contract notification failed:', e));
  }

  // Slack
  postSlackNotification(
    `✅ Student request completed: ${request.student_name} → ${tutor?.name ?? 'Unknown'} at $${hourly_rate}/hr (by ${user.email})`
  ).catch(() => {});

  return NextResponse.json({ success: true, contract_id: contract.id });
}
