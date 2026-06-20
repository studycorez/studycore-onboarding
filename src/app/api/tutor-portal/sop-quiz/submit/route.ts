import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyTutorJWT, COOKIE_NAME } from '@/lib/tutor-auth';
import { getCurrentSopVersion } from '@/lib/sop-quiz';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

function makeSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const PASS_THRESHOLD = 8;

interface AnswerEntry {
  question_id: string;
  selected_option: string;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyTutorJWT(token);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();

  try {
    const body = await req.json();
    const answers: AnswerEntry[] = body.answers;

    if (!Array.isArray(answers) || answers.length !== 10) {
      return NextResponse.json({ error: 'Must submit exactly 10 answers' }, { status: 400 });
    }

    // Validate each answer has required fields and valid option
    const validOptions = new Set(['A', 'B', 'C', 'D']);
    for (const a of answers) {
      if (!a.question_id || !a.selected_option || !validOptions.has(a.selected_option)) {
        return NextResponse.json({
          error: 'Each answer must have question_id and selected_option (A, B, C, or D)',
        }, { status: 400 });
      }
    }

    const version = await getCurrentSopVersion(supabase);
    if (!version) {
      return NextResponse.json({ error: 'No SOP version configured' }, { status: 404 });
    }

    // ── Fetch correct answers (server-side only) ─────────────────────────
    const { data: questions, error: qErr } = await supabase
      .from('sop_quiz_questions')
      .select('id, correct_option')
      .eq('version_id', version.id);

    if (qErr || !questions || questions.length !== 10) {
      return NextResponse.json({ error: 'Failed to load quiz questions' }, { status: 500 });
    }

    // Validate all submitted question_ids belong to current version
    const questionMap = new Map(questions.map(q => [q.id, q.correct_option]));
    for (const a of answers) {
      if (!questionMap.has(a.question_id)) {
        return NextResponse.json({
          error: `Invalid question_id: ${a.question_id}`,
        }, { status: 400 });
      }
    }

    // ── Score ────────────────────────────────────────────────────────────
    let score = 0;
    const wrongQuestionIds: string[] = [];

    for (const a of answers) {
      const correct = questionMap.get(a.question_id)!;
      if (a.selected_option === correct) {
        score++;
      } else {
        wrongQuestionIds.push(a.question_id);
      }
    }

    const passed = score >= PASS_THRESHOLD;

    // ── Race-safe state mutation via Postgres RPC ─────────────────────────
    const { data: result, error: rpcErr } = await supabase.rpc('submit_sop_quiz_attempt', {
      p_tutor_id: payload.tutorId,
      p_version_id: version.id,
      p_score: score,
      p_passed: passed,
    });

    if (rpcErr) {
      if (rpcErr.message?.includes('ALREADY_PASSED')) {
        return NextResponse.json({
          error: 'You have already passed the SOP quiz for this version.',
          passed: true,
        }, { status: 409 });
      }
      if (rpcErr.message?.includes('LOCKED_UNTIL:')) {
        const lockedUntil = rpcErr.message.split('LOCKED_UNTIL:')[1].trim();
        return NextResponse.json({
          error: `You are locked out until ${lockedUntil}.`,
          is_locked: true,
          locked_until: lockedUntil,
        }, { status: 409 });
      }
      console.error('[sop-quiz/submit] RPC failed:', rpcErr.message);
      postToSlack(`🚨 SOP quiz submit RPC failed for tutor ${payload.tutorId}: ${rpcErr.message}`)
        .catch(e => console.error('[sop-quiz/submit] Slack alert failed:', e));
      return NextResponse.json({ error: 'Failed to save quiz result' }, { status: 500 });
    }

    const state = Array.isArray(result) ? result[0] : result;

    return NextResponse.json({
      passed,
      score,
      wrong_question_ids: wrongQuestionIds,
      attempts_used: state.attempts_used,
      attempts_remaining: state.attempts_remaining,
      is_locked: state.is_locked,
      locked_until: state.locked_until,
    });
  } catch (err: any) {
    console.error('[sop-quiz/submit] Unexpected error:', err);
    postToSlack(`🚨 SOP quiz submit error for tutor ${payload.tutorId}: ${err.message ?? 'unknown'}`)
      .catch(e => console.error('[sop-quiz/submit] Slack alert failed:', e));
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
