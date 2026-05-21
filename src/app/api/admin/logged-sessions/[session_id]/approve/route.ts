import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// Placeholder student used while the session awaits admin approval.
// Approving with this id still in place is a bug — reject it.
const UNMATCHED_STUDENT_ID = '23afaea2-9e1f-4601-8b5f-f763b1e84330';

function makeServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

// POST /api/admin/logged-sessions/[session_id]/approve
// Body: { student_id: string }  — the real student the admin linked.
// Sets student_id = <real student> AND status = 'completed' in one update.
// Refuses to approve if student_id is missing, invalid, or still the placeholder.
export async function POST(
  req: NextRequest,
  { params }: { params: { session_id: string } },
) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { student_id } = body;

  if (!student_id)
    return NextResponse.json({ error: 'student_id is required to approve a logged session' }, { status: 400 });
  if (student_id === UNMATCHED_STUDENT_ID)
    return NextResponse.json({ error: 'Must link a real student — placeholder id not accepted' }, { status: 400 });

  const supabase = makeServiceSupabase();
  const { session_id } = params;

  // ── Verify the student exists ─────────────────────────────────────────────
  const { data: student, error: studentErr } = await supabase
    .from('students')
    .select('id')
    .eq('id', student_id)
    .maybeSingle();

  if (studentErr || !student)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  // ── Verify it's a tutor-logged pending session ────────────────────────────
  const { data: session, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, status, created_by_tutor')
    .eq('id', session_id)
    .maybeSingle();

  if (fetchErr || !session)
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (!session.created_by_tutor)
    return NextResponse.json({ error: 'Not a tutor-logged session' }, { status: 400 });
  if (session.status !== 'pending_approval')
    return NextResponse.json({ error: `Session status is '${session.status}', not pending_approval` }, { status: 409 });

  // ── Link real student + complete in one update ────────────────────────────
  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ status: 'completed', student_id })
    .eq('id', session_id);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
