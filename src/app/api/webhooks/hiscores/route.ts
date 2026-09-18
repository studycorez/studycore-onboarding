/**
 * HiScores webhook handler.
 * Fires when a student completes an attempt. Only acts on fullLength (full SAT) attempts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendCheckinBookingLink } from '@/lib/checkin';
import { postToSlack } from '@/lib/slack';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event    = body?.event ?? body?.type ?? '';
  const attempt  = body?.attempt ?? body?.data ?? body ?? {};
  const category = attempt?.category ?? attempt?.type ?? '';
  const student  = attempt?.student ?? {};
  const studentName = student?.name ?? attempt?.studentName ?? '';

  // Only fire for fullLength SAT attempts
  if (!['attempt.finished', 'attempt_finished', 'ATTEMPT_FINISHED'].includes(event)) {
    return NextResponse.json({ ok: true });
  }

  if (category !== 'fullLength') {
    console.log(`[hiscores] skipping category=${category} — not fullLength`);
    return NextResponse.json({ ok: true });
  }

  if (!studentName) {
    await postToSlack(`⚠️ HiScores fullLength attempt finished — no student name in payload`);
    return NextResponse.json({ ok: true });
  }

  await sendCheckinBookingLink('', studentName, 'Post-Practice Test');

  return NextResponse.json({ ok: true });
}
