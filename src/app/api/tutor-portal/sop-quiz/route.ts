import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { getCurrentSopVersion, getTutorSopStatus } from '@/lib/sop-quiz';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  const version = await getCurrentSopVersion(supabase);
  if (!version) {
    return NextResponse.json({ error: 'No SOP version configured' }, { status: 404 });
  }

  // Fetch questions WITHOUT correct_option (never expose to client)
  const { data: questions, error } = await supabase
    .from('sop_quiz_questions')
    .select('id, question_number, question_text, option_a, option_b, option_c, option_d')
    .eq('version_id', version.id)
    .order('question_number', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const status = await getTutorSopStatus(payload.tutorId, supabase);

  return NextResponse.json({
    version: {
      id: version.id,
      version_number: version.version_number,
      sop_url: version.sop_url,
    },
    questions: questions ?? [],
    status: status ? {
      passed: status.passed,
      attempts_used: status.attempts_used,
      attempts_remaining: status.attempts_remaining,
      is_locked: status.is_locked,
      locked_until: status.locked_until,
      last_attempt_score: status.last_attempt_score,
    } : null,
  });
}
