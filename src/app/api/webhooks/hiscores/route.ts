/**
 * HiScores webhook handler.
 * Fires when a student completes an attempt. Only acts on fullLength (full SAT) attempts.
 * Increments the Full Length Count and moves the pipeline stage accordingly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendCheckinBookingLink } from '@/lib/checkin';
import { getContactForTracking, moveStageForFullLength, HOUR_CF } from '@/lib/ghl-support';
import { postToSlack } from '@/lib/slack';

const GHL_BASE = 'https://services.leadconnectorhq.com';

function ghlHeaders() {
  return {
    Authorization: `Bearer ${process.env.GHL_SUPPORT_API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true });
}

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

  const tracking = await getContactForTracking(studentName);
  if (!tracking?.contactId) {
    await postToSlack(`⚠️ HiScores fullLength: *${studentName}* — couldn't find contact in GHL`);
    await sendCheckinBookingLink('', studentName, 'Post-Practice Test');
    return NextResponse.json({ ok: true });
  }

  const { contactId, opportunityId } = tracking;

  // Read current full-length count from GHL
  let currentCount = 0;
  if (HOUR_CF.FULL_LENGTH_COUNT) {
    const contactRes = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlHeaders() });
    if (contactRes.ok) {
      const contactData = await contactRes.json();
      const cf = (contactData.contact?.customFields ?? []).find((f: any) => f.id === HOUR_CF.FULL_LENGTH_COUNT);
      currentCount = parseInt(cf?.fieldValueString ?? '0', 10) || 0;
    }
  }

  const newCount = currentCount + 1;

  // Move stage based on attempt number, then send booking link
  if (opportunityId) {
    await moveStageForFullLength(opportunityId, contactId, newCount);
  }

  await sendCheckinBookingLink(contactId, studentName, 'Post-Practice Test');

  await postToSlack(`📊 HiScores fullLength #${newCount}: *${studentName}* — booking link sent`);

  return NextResponse.json({ ok: true });
}
