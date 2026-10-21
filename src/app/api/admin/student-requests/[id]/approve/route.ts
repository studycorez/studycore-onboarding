// FALLBACK ENDPOINT - direct API-only approval, bypasses the standard flow.
// Standard flow is: admin clicks Approve in UI → /students?from_request=X → /complete endpoint.
// This endpoint kept for direct admin use only (e.g. scripted approval).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendStudentRequestApprovedEmail } from '@/lib/email';
import { postSlackNotification } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
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
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { hourly_rate, force_approve } = body;

  if (!hourly_rate || typeof hourly_rate !== 'number' || hourly_rate <= 0) {
    return NextResponse.json({ error: 'hourly_rate is required and must be a positive number' }, { status: 400 });
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
    return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
  }

  // Dupe check
  if (!force_approve) {
    let dupeQuery = supabase
      .from('students')
      .select('id, name, email, parent_email');

    if (request.parent_email) {
      dupeQuery = dupeQuery.or(`name.ilike.%${request.student_name}%,parent_email.ilike.${request.parent_email}`);
    } else {
      dupeQuery = dupeQuery.ilike('name', `%${request.student_name}%`);
    }

    const { data: dupes } = await dupeQuery;

    if (dupes && dupes.length > 0) {
      return NextResponse.json({
        error: 'duplicates_found',
        duplicates: dupes.map(d => ({
          id: d.id,
          name: d.name,
          email: d.email,
          parent_email: d.parent_email,
        })),
      }, { status: 409 });
    }
  }

  // Create student
  const now = new Date().toISOString();
  const { data: student, error: studentErr } = await supabase
    .from('students')
    .insert({
      name: request.student_name,
      email: request.parent_email ?? `pending-${Date.now()}@studycore.net`,
      parent_name: request.parent_name ?? null,
      parent_email: request.parent_email ?? null,
      parent_phone: request.parent_phone ?? null,
      grade: request.grade ?? null,
      target_score: request.target_score ?? null,
      test_date: request.test_date ?? null,
      school: request.school ?? null,
      status: 'active',
    })
    .select('id')
    .single();

  if (studentErr || !student) {
    return NextResponse.json({ error: `Failed to create student: ${studentErr?.message}` }, { status: 500 });
  }

  // Create contract
  const { data: contract, error: contractErr } = await supabase
    .from('contracts')
    .insert({
      tutor_id: request.tutor_id,
      student_id: student.id,
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
      reviewed_at: now,
      reviewed_by: user.email,
      created_student_id: student.id,
      created_contract_id: contract.id,
      updated_at: now,
    })
    .eq('id', params.id);

  // Email tutor
  const tutor = request.tutor as any;
  if (tutor?.email) {
    sendStudentRequestApprovedEmail(tutor.email, tutor.name, request.student_name)
      .catch(e => console.error('[student-requests/approve] Email failed:', e));
  }

  // Slack
  postSlackNotification(
    `✅ Student request approved: ${request.student_name} → ${tutor?.name ?? 'Unknown'} (by ${user.email})`
  ).catch(() => {});

  return NextResponse.json({ success: true, student_id: student.id, contract_id: contract.id });
}
